import { Hono } from 'hono';
import { Env } from '../worker';
import { generateId } from '../utils/id';

export const checklistsRoutes = new Hono<{ Bindings: Env }>();

// Get user's checklist runs
checklistsRoutes.get('/', async (c) => {
  const payload = c.get('jwtPayload');
  const db = c.env.DB;
  const { status, limit = 20, offset = 0 } = c.req.query();
  
  let query = 'SELECT * FROM checklist_runs WHERE user_id = ?';
  const params: (string | number)[] = [payload.sub];
  
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  
  query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));
  
  const runs = await db.prepare(query).bind(...params).all();
  
  // Parse JSON sections
  const parsedRuns = runs.results.map(run => ({
    ...run,
    sections: JSON.parse(run.sections as string)
  }));
  
  return c.json({ runs: parsedRuns });
});

// Get single checklist run
checklistsRoutes.get('/:id', async (c) => {
  const runId = c.req.param('id');
  const payload = c.get('jwtPayload');
  const db = c.env.DB;
  
  const run = await db.prepare(
    'SELECT * FROM checklist_runs WHERE id = ? AND user_id = ?'
  ).bind(runId, payload.sub).first();
  
  if (!run) {
    return c.json({ error: 'Checklist run not found' }, 404);
  }
  
  run.sections = JSON.parse(run.sections as string);
  
  return c.json({ run });
});

// Create checklist run from template
checklistsRoutes.post('/from-template/:templateId', async (c) => {
  const templateId = c.req.param('templateId');
  const payload = c.get('jwtPayload');
  const { title } = await c.req.json();
  const db = c.env.DB;
  
  // Get template
  const template = await db.prepare(
    'SELECT * FROM templates WHERE id = ? AND (is_public = true OR user_id = ?)'
  ).bind(templateId, payload.sub).first();
  
  if (!template) {
    return c.json({ error: 'Template not found' }, 404);
  }
  
  const runId = generateId();
  
  await db.prepare(`
    INSERT INTO checklist_runs (
      id, user_id, template_id, template_version, title, sections, status, progress
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    runId,
    payload.sub,
    templateId,
    template.version,
    title || template.title,
    template.sections, // Will have progress added by frontend
    'in_progress',
    0
  ).run();
  
  return c.json({ id: runId, message: 'Checklist run created' }, 201);
});

// Update checklist run progress
checklistsRoutes.patch('/:id', async (c) => {
  const runId = c.req.param('id');
  const payload = c.get('jwtPayload');
  const body = await c.req.json();
  const db = c.env.DB;
  
  // Check ownership
  const existing = await db.prepare(
    'SELECT user_id FROM checklist_runs WHERE id = ?'
  ).bind(runId).first();
  
  if (!existing) {
    return c.json({ error: 'Checklist run not found' }, 404);
  }
  
  if (existing.user_id !== payload.sub) {
    return c.json({ error: 'Unauthorized' }, 403);
  }
  
  const updates: string[] = [];
  const params: (string | number)[] = [];
  
  if (body.sections !== undefined) {
    updates.push('sections = ?');
    params.push(JSON.stringify(body.sections));
  }
  
  if (body.progress !== undefined) {
    updates.push('progress = ?');
    params.push(body.progress);
  }
  
  if (body.status !== undefined) {
    updates.push('status = ?');
    params.push(body.status);
    
    if (body.status === 'completed') {
      updates.push('completed_at = CURRENT_TIMESTAMP');
    }
  }
  
  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(runId);
  
  await db.prepare(
    `UPDATE checklist_runs SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...params).run();
  
  return c.json({ message: 'Checklist run updated' });
});

// Delete checklist run
checklistsRoutes.delete('/:id', async (c) => {
  const runId = c.req.param('id');
  const payload = c.get('jwtPayload');
  const db = c.env.DB;
  
  // Check ownership
  const existing = await db.prepare(
    'SELECT user_id FROM checklist_runs WHERE id = ?'
  ).bind(runId).first();
  
  if (!existing) {
    return c.json({ error: 'Checklist run not found' }, 404);
  }
  
  if (existing.user_id !== payload.sub) {
    return c.json({ error: 'Unauthorized' }, 403);
  }
  
  await db.prepare('DELETE FROM checklist_runs WHERE id = ?').bind(runId).run();
  
  return c.json({ message: 'Checklist run deleted' });
});