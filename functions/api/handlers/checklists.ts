import { Env } from '../types';
import { verifyJWT } from '../utils/jwt';

export async function handleChecklists(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  const userId = authHeader ? await verifyJWT(authHeader.replace('Bearer ', ''), env.JWT_SECRET) : null;
  
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (request.method === 'GET') {
    const checklists = await env.DB.prepare(
      'SELECT * FROM checklist_runs WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(userId).all();
    
    return new Response(JSON.stringify(checklists.results), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (request.method === 'POST') {
    const { template_id, title, items, status } = await request.json();
    const checklistId = crypto.randomUUID();
    const now = new Date().toISOString();
    
    await env.DB.prepare(
      'INSERT INTO checklist_runs (id, user_id, template_id, title, items, status, started_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      checklistId,
      userId,
      template_id,
      title,
      JSON.stringify(items),
      status || 'in_progress',
      now,  // started_at
      now   // created_at
    ).run();
    
    return new Response(JSON.stringify({ id: checklistId }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (request.method === 'PUT') {
    const url = new URL(request.url);
    const checklistId = url.pathname.split('/').pop();
    
    if (!checklistId || checklistId === 'checklists') {
      return new Response(JSON.stringify({ error: 'Checklist ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const { title, items, status, progress, completed_at } = await request.json();
    
    // Build dynamic update query
    const updates = [];
    const values = [];
    
    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (items !== undefined) {
      updates.push('items = ?');
      values.push(JSON.stringify(items));
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }
    if (progress !== undefined) {
      updates.push('progress = ?');
      values.push(progress);
    }
    if (completed_at !== undefined) {
      updates.push('completed_at = ?');
      values.push(completed_at);
    }
    
    if (updates.length === 0) {
      return new Response(JSON.stringify({ error: 'No fields to update' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    values.push(checklistId);
    values.push(userId);
    
    await env.DB.prepare(
      `UPDATE checklist_runs SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`
    ).bind(...values).run();
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const checklistId = url.pathname.split('/').pop();
    
    if (!checklistId || checklistId === 'checklists') {
      return new Response(JSON.stringify({ error: 'Checklist ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // First check if the checklist exists and belongs to the user
    const existingChecklist = await env.DB.prepare(
      'SELECT id FROM checklist_runs WHERE id = ? AND user_id = ?'
    ).bind(checklistId, userId).first();
    
    if (!existingChecklist) {
      return new Response(JSON.stringify({ error: 'Checklist not found or unauthorized' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Now delete the checklist
    await env.DB.prepare(
      'DELETE FROM checklist_runs WHERE id = ? AND user_id = ?'
    ).bind(checklistId, userId).run();
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response('Method Not Allowed', { status: 405 });
}