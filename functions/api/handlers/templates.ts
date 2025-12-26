import { Env } from '../types';
import { verifyJWT } from '../utils/jwt';
import { generateSlug } from '../utils/slug';

async function generateUniqueSlug(env: Env, title: string, templateId: string): Promise<string> {
  const base = generateSlug(title || 'template') || 'template';

  // Prefer the clean slug if available; otherwise fall back to a deterministic suffix.
  const exists = await env.DB.prepare('SELECT id FROM templates WHERE slug = ? LIMIT 1')
    .bind(base)
    .first();

  if (!exists) return base;

  const suffixed = `${base}-${templateId.slice(0, 8)}`;
  const existsSuffixed = await env.DB.prepare('SELECT id FROM templates WHERE slug = ? LIMIT 1')
    .bind(suffixed)
    .first();

  if (!existsSuffixed) return suffixed;

  // Extremely unlikely collision; use random suffix.
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

function parseTemplateRow(template: Record<string, unknown>) {
  let sections: unknown[] = [];
  if (template.items) {
    const parsedItems = typeof template.items === 'string' ? JSON.parse(template.items) : template.items;
    // Check if items is already in sections format (has id, title, items properties)
    if (Array.isArray(parsedItems) && parsedItems.length > 0 && typeof (parsedItems[0] as Record<string, unknown>)?.items !== 'undefined') {
      sections = parsedItems;
    } else {
      // Legacy format - wrap in a single section
      sections = [{
        id: '1',
        title: 'Checklist',
        items: parsedItems
      }];
    }
  }

  // Parse categories - handle both single string and JSON array
  let categories: unknown[] = [];
  if (template.category) {
    try {
      categories = JSON.parse(String(template.category));
    } catch {
      categories = [template.category];
    }
  }

  return {
    ...template,
    sections,
    categories,
    tags: typeof template.tags === 'string' ? JSON.parse(template.tags || '[]') : (template.tags || [])
  };
}

export async function handleTemplates(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  const userId = authHeader ? await verifyJWT(authHeader.replace('Bearer ', ''), env.JWT_SECRET) : null;
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean); // ["api", "templates", ...]
  const templatesSubpath = pathParts.slice(2); // after /api/templates
  
  if (request.method === 'GET') {
    // GET /api/templates/public?userId=...
    if (templatesSubpath[0] === 'public') {
      const targetUserId = url.searchParams.get('userId');
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: 'userId required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const templates = await env.DB.prepare(
        'SELECT * FROM templates WHERE is_public = 1 AND user_id = ? ORDER BY created_at DESC'
      ).bind(targetUserId).all();

      return new Response(JSON.stringify(templates.results.map((t) => parseTemplateRow(t as unknown as Record<string, unknown>))), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // GET /api/templates/slug/:slug
    if (templatesSubpath[0] === 'slug' && templatesSubpath[1]) {
      const slug = templatesSubpath.slice(1).join('/');
      const template = await env.DB.prepare(
        'SELECT * FROM templates WHERE slug = ? AND (is_public = 1 OR user_id = ?) LIMIT 1'
      ).bind(slug, userId || '').first();

      if (!template) {
        return new Response(JSON.stringify({ error: 'Template not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify(parseTemplateRow(template as unknown as Record<string, unknown>)), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // GET /api/templates/:id
    if (templatesSubpath[0]) {
      const templateId = templatesSubpath[0];
      const template = await env.DB.prepare(
        'SELECT * FROM templates WHERE id = ? AND (is_public = 1 OR user_id = ?) LIMIT 1'
      ).bind(templateId, userId || '').first();

      if (!template) {
        return new Response(JSON.stringify({ error: 'Template not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify(parseTemplateRow(template as unknown as Record<string, unknown>)), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // GET /api/templates (list)
    const templates = await env.DB.prepare(
      'SELECT * FROM templates WHERE is_public = 1 OR user_id = ? ORDER BY created_at DESC'
    ).bind(userId || '').all();

    return new Response(JSON.stringify(templates.results.map((t) => parseTemplateRow(t as unknown as Record<string, unknown>))), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (request.method === 'POST') {
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const body = await request.json();
    const { title, description, is_public, categories, category, tags, sections, items: bodyItems } = body;

    // Handle both items and sections format
    let items = bodyItems;
    if (!items && sections) {
      // Store the full sections structure as items to preserve all content
      items = sections;
    }
    
    const templateId = crypto.randomUUID();
    const slug = await generateUniqueSlug(env, title || '', templateId);

    const finalCategories = Array.isArray(categories)
      ? categories
      : (typeof category === 'string' && category ? [category] : []);
    
    await env.DB.prepare(
      'INSERT INTO templates (id, user_id, title, description, items, is_public, category, tags, slug, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      templateId, 
      userId, 
      title || '', 
      description || '', 
      JSON.stringify(sections || items || []), // Store sections/items
      is_public ? 1 : 0,
      JSON.stringify(finalCategories || []),  // Store categories array as JSON
      JSON.stringify(tags || []),
      slug,
      new Date().toISOString()
    ).run();
    
    return new Response(JSON.stringify({ id: templateId, slug }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (request.method === 'PUT') {
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const url = new URL(request.url);
    const templateId = url.pathname.split('/').pop();
    
    if (!templateId || templateId === 'templates') {
      return new Response(JSON.stringify({ error: 'Template ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const body = await request.json();
    const { title, description, is_public, categories, category, tags, slug: requestedSlug } = body;

    // Handle both items and sections format
    let items = body.items;
    if (!items && body.sections) {
      // Store the full sections structure as items to preserve all content
      items = body.sections;
    }

    // Only update slug if explicitly provided (avoid breaking shared URLs on title edits).
    let nextSlug: string | null = null;
    if (typeof requestedSlug === 'string' && requestedSlug.trim()) {
      nextSlug = generateSlug(requestedSlug.trim());
      const conflict = await env.DB.prepare('SELECT id FROM templates WHERE slug = ? AND id != ? LIMIT 1')
        .bind(nextSlug, templateId)
        .first();
      if (conflict) {
        nextSlug = `${nextSlug}-${templateId.slice(0, 8)}`;
      }
    }

    const finalCategories = Array.isArray(categories)
      ? categories
      : (typeof category === 'string' && category ? [category] : []);
    
    await env.DB.prepare(
      'UPDATE templates SET title = ?, description = ?, items = ?, is_public = ?, category = ?, tags = ?, slug = COALESCE(?, slug), updated_at = ? WHERE id = ? AND user_id = ?'
    ).bind(
      title || '',
      description || '',
      JSON.stringify(items || []),
      is_public ? 1 : 0,
      JSON.stringify(finalCategories || []),  // Store categories array as JSON in category column
      JSON.stringify(tags || []),
      nextSlug,
      new Date().toISOString(),
      templateId,
      userId
    ).run();
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (request.method === 'DELETE') {
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const url = new URL(request.url);
    const templateId = url.pathname.split('/').pop();
    
    if (!templateId || templateId === 'templates') {
      return new Response(JSON.stringify({ error: 'Template ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // First check if the template exists and belongs to the user
    const existingTemplate = await env.DB.prepare(
      'SELECT id FROM templates WHERE id = ? AND user_id = ?'
    ).bind(templateId, userId).first();
    
    if (!existingTemplate) {
      return new Response(JSON.stringify({ error: 'Template not found or unauthorized' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Now delete the template
    await env.DB.prepare(
      'DELETE FROM templates WHERE id = ? AND user_id = ?'
    ).bind(templateId, userId).run();
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response('Method Not Allowed', { status: 405 });
}
