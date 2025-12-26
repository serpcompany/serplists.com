import { Env } from '../types';
import { verifyJWT } from '../utils/jwt';
import { generateSlug } from '../utils/slug';

export async function handleTemplates(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  const userId = authHeader ? await verifyJWT(authHeader.replace('Bearer ', ''), env.JWT_SECRET) : null;
  
  if (request.method === 'GET') {
    const templates = await env.DB.prepare(
      'SELECT * FROM templates WHERE is_public = 1 OR user_id = ? ORDER BY created_at DESC'
    ).bind(userId || '').all();
    
    // Convert items to sections format for frontend compatibility
    const transformedTemplates = templates.results.map((template: Record<string, string | number | boolean | null>) => {
      let sections;
      if (template.items) {
        const parsedItems = typeof template.items === 'string' ? JSON.parse(template.items) : template.items;
        // Check if items is already in sections format (has id, title, items properties)
        if (Array.isArray(parsedItems) && parsedItems.length > 0 && parsedItems[0].items) {
          sections = parsedItems;
        } else {
          // Legacy format - wrap in a single section
          sections = [{
            id: '1',
            title: 'Checklist',
            items: parsedItems
          }];
        }
      } else {
        sections = [];
      }
      
      // Parse categories - handle both single string and JSON array
      let categories;
      if (template.category) {
        try {
          // Try to parse as JSON array first
          categories = JSON.parse(template.category);
        } catch {
          // If not JSON, treat as single category string
          categories = [template.category];
        }
      } else {
        categories = [];
      }
      
      return {
        ...template,
        sections,
        categories,
        tags: typeof template.tags === 'string' ? JSON.parse(template.tags || '[]') : (template.tags || [])
      };
    });
    
    return new Response(JSON.stringify(transformedTemplates), {
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
    const { title, description, is_public, categories, tags, sections, items: bodyItems } = body;
    
    // Handle both items and sections format
    let items = bodyItems;
    if (!items && sections) {
      // Store the full sections structure as items to preserve all content
      items = sections;
    }
    
    const templateId = crypto.randomUUID();
    // Generate slug from title
    const slug = generateSlug(title);
    
    await env.DB.prepare(
      'INSERT INTO templates (id, user_id, title, description, items, is_public, category, tags, slug, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      templateId, 
      userId, 
      title || '', 
      description || '', 
      JSON.stringify(sections || items || []), // Store sections/items
      is_public ? 1 : 0,
      JSON.stringify(categories || []),  // Store categories array as JSON
      JSON.stringify(tags || []),
      slug,
      new Date().toISOString()
    ).run();
    
    return new Response(JSON.stringify({ id: templateId }), {
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
    const { title, description, is_public, categories, tags } = body;
    
    // Handle both items and sections format
    let items = body.items;
    if (!items && body.sections) {
      // Store the full sections structure as items to preserve all content
      items = body.sections;
    }
    
    await env.DB.prepare(
      'UPDATE templates SET title = ?, description = ?, items = ?, is_public = ?, category = ?, tags = ?, updated_at = ? WHERE id = ? AND user_id = ?'
    ).bind(
      title || '',
      description || '',
      JSON.stringify(items || []),
      is_public ? 1 : 0,
      JSON.stringify(categories || []),  // Store categories array as JSON in category column
      JSON.stringify(tags || []),
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