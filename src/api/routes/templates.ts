import { Hono } from 'hono';
import { Env } from '../worker';
import { generateId } from '../utils/id';

export const templatesRoutes = new Hono<{ Bindings: Env }>();

// Get public templates
templatesRoutes.get('/public', async (c) => {
  const db = c.env.DB;
  const { category, search, limit = 20, offset = 0 } = c.req.query();
  
  let query = `
    SELECT t.*, u.name as author_name, u.avatar_url as author_avatar
    FROM templates t
    JOIN users u ON t.user_id = u.id
    WHERE t.is_public = true
  `;
  const params: unknown[] = [];
  
  if (category) {
    query += ' AND t.category = ?';
    params.push(category);
  }
  
  if (search) {
    query += ' AND (t.title LIKE ? OR t.description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  
  query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));
  
  const stmt = db.prepare(query);
  const result = await stmt.bind(...params).all();
  
  return c.json({ templates: result.results });
});

// Get user's templates
templatesRoutes.get('/my', async (c) => {
  const payload = c.get('jwtPayload');
  const db = c.env.DB;
  
  const templates = await db.prepare(`
    SELECT * FROM templates 
    WHERE user_id = ? 
    ORDER BY updated_at DESC
  `).bind(payload.sub).all();
  
  return c.json({ templates: templates.results });
});

// Get single template
templatesRoutes.get('/:id', async (c) => {
  const templateId = c.req.param('id');
  const payload = c.get('jwtPayload');
  const db = c.env.DB;
  
  const template = await db.prepare(`
    SELECT t.*, u.name as author_name, u.avatar_url as author_avatar
    FROM templates t
    JOIN users u ON t.user_id = u.id
    WHERE t.id = ? AND (t.is_public = true OR t.user_id = ?)
  `).bind(templateId, payload?.sub || '').first();
  
  if (!template) {
    return c.json({ error: 'Template not found' }, 404);
  }
  
  // Parse JSON fields
  template.sections = JSON.parse(template.sections as string);
  template.tags = JSON.parse(template.tags as string || '[]');
  
  // Increment view count if not owner
  if (payload?.sub !== template.user_id) {
    await db.prepare(
      'UPDATE templates SET view_count = view_count + 1 WHERE id = ?'
    ).bind(templateId).run();
  }
  
  return c.json({ template });
});

// Create template
templatesRoutes.post('/', async (c) => {
  const payload = c.get('jwtPayload');
  const body = await c.req.json();
  const db = c.env.DB;
  
  const templateId = generateId();
  
  await db.prepare(`
    INSERT INTO templates (
      id, user_id, title, description, category, tags, sections,
      is_public, seo_title, seo_description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    templateId,
    payload.sub,
    body.title,
    body.description || null,
    body.category || null,
    JSON.stringify(body.tags || []),
    JSON.stringify(body.sections),
    body.is_public || false,
    body.seo_title || null,
    body.seo_description || null
  ).run();
  
  return c.json({ id: templateId, message: 'Template created' }, 201);
});

// Update template
templatesRoutes.put('/:id', async (c) => {
  const templateId = c.req.param('id');
  const payload = c.get('jwtPayload');
  const body = await c.req.json();
  const db = c.env.DB;
  
  // Check ownership
  const existing = await db.prepare(
    'SELECT user_id FROM templates WHERE id = ?'
  ).bind(templateId).first();
  
  if (!existing) {
    return c.json({ error: 'Template not found' }, 404);
  }
  
  if (existing.user_id !== payload.sub) {
    return c.json({ error: 'Unauthorized' }, 403);
  }
  
  await db.prepare(`
    UPDATE templates SET
      title = ?, description = ?, category = ?, tags = ?, sections = ?,
      is_public = ?, seo_title = ?, seo_description = ?,
      version = version + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    body.title,
    body.description || null,
    body.category || null,
    JSON.stringify(body.tags || []),
    JSON.stringify(body.sections),
    body.is_public || false,
    body.seo_title || null,
    body.seo_description || null,
    templateId
  ).run();
  
  return c.json({ message: 'Template updated' });
});

// Delete template
templatesRoutes.delete('/:id', async (c) => {
  const templateId = c.req.param('id');
  const payload = c.get('jwtPayload');
  const db = c.env.DB;
  
  // Check ownership
  const existing = await db.prepare(
    'SELECT user_id FROM templates WHERE id = ?'
  ).bind(templateId).first();
  
  if (!existing) {
    return c.json({ error: 'Template not found' }, 404);
  }
  
  if (existing.user_id !== payload.sub) {
    return c.json({ error: 'Unauthorized' }, 403);
  }
  
  await db.prepare('DELETE FROM templates WHERE id = ?').bind(templateId).run();
  
  return c.json({ message: 'Template deleted' });
});

// Fork template
templatesRoutes.post('/:id/fork', async (c) => {
  const templateId = c.req.param('id');
  const payload = c.get('jwtPayload');
  const db = c.env.DB;
  
  // Get original template
  const original = await db.prepare(
    'SELECT * FROM templates WHERE id = ? AND is_public = true'
  ).bind(templateId).first();
  
  if (!original) {
    return c.json({ error: 'Template not found or not public' }, 404);
  }
  
  const newTemplateId = generateId();
  
  // Create forked template
  await db.prepare(`
    INSERT INTO templates (
      id, user_id, title, description, category, tags, sections,
      is_public, seo_title, seo_description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    newTemplateId,
    payload.sub,
    `${original.title} (Fork)`,
    original.description,
    original.category,
    original.tags,
    original.sections,
    false, // Start as private
    original.seo_title,
    original.seo_description
  ).run();
  
  // Record fork relationship
  await db.prepare(`
    INSERT INTO template_forks (id, original_template_id, forked_template_id, user_id)
    VALUES (?, ?, ?, ?)
  `).bind(generateId(), templateId, newTemplateId, payload.sub).run();
  
  // Increment fork count
  await db.prepare(
    'UPDATE templates SET fork_count = fork_count + 1 WHERE id = ?'
  ).bind(templateId).run();
  
  return c.json({ id: newTemplateId, message: 'Template forked' }, 201);
});