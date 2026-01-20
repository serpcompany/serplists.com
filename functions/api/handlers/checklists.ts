import { Env } from '../types';
import { verifyJWT } from '../utils/jwt';
import { and, desc, eq } from 'drizzle-orm';
import { createDb, schema } from '../db';
import { checklistPayloadSchema, normalizeSectionsPayload } from '../utils/payloads';

export async function handleChecklists(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  const userId = authHeader ? await verifyJWT(authHeader.replace('Bearer ', ''), env.JWT_SECRET) : null;
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean); // ["api", "checklists", ...]
  const checklistsSubpath = pathParts.slice(2); // after /api/checklists
  const db = createDb(env);
  const { checklist_runs } = schema;

  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.method === 'GET') {
    // GET /api/checklists/:id
    if (checklistsSubpath[0]) {
      const checklistId = checklistsSubpath[0];
      const [checklist] = await db
        .select()
        .from(checklist_runs)
        .where(and(eq(checklist_runs.id, checklistId), eq(checklist_runs.user_id, userId)))
        .limit(1);

      if (!checklist) {
        return new Response(JSON.stringify({ error: 'Checklist not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify(checklist), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const checklists = await db
      .select()
      .from(checklist_runs)
      .where(eq(checklist_runs.user_id, userId))
      .orderBy(desc(checklist_runs.created_at));

    return new Response(JSON.stringify(checklists), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.method === 'POST') {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const parsed = checklistPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message || 'Invalid checklist payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { template_id, title, items, sections, status } = parsed.data;
    const checklistId = crypto.randomUUID();
    const now = new Date().toISOString();

    const normalizedSections = normalizeSectionsPayload(sections ?? items);
    if (normalizedSections.error) {
      return new Response(JSON.stringify({ error: normalizedSections.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await db.insert(checklist_runs).values({
      id: checklistId,
      user_id: userId,
      template_id: template_id ?? null,
      title: title || '',
      items: JSON.stringify(normalizedSections.sections),
      status: status || 'in_progress',
      started_at: now,
      created_at: now,
    });

    return new Response(JSON.stringify({ id: checklistId }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.method === 'PUT') {
    const checklistId = checklistsSubpath[0];

    if (!checklistId || checklistId === 'checklists') {
      return new Response(JSON.stringify({ error: 'Checklist ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const parsed = checklistPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message || 'Invalid checklist payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { title, items, sections, status, progress, completed_at } = parsed.data;
    const rawBody = body as Record<string, unknown>;

    // Build dynamic update query
    const updates: Record<string, unknown> = {};

    if (title !== undefined) {
      updates.title = title;
    }
    if (Object.prototype.hasOwnProperty.call(rawBody, 'sections') || Object.prototype.hasOwnProperty.call(rawBody, 'items')) {
      const normalizedSections = normalizeSectionsPayload(sections ?? items);
      if (normalizedSections.error) {
        return new Response(JSON.stringify({ error: normalizedSections.error }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      updates.items = JSON.stringify(normalizedSections.sections);
    }
    if (status !== undefined) {
      updates.status = status;
    }
    if (progress !== undefined) {
      updates.progress = progress;
    }
    if (completed_at !== undefined) {
      updates.completed_at = completed_at;
    }

    if (Object.keys(updates).length === 0) {
      return new Response(JSON.stringify({ error: 'No fields to update' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await db.update(checklist_runs)
      .set(updates)
      .where(and(eq(checklist_runs.id, checklistId), eq(checklist_runs.user_id, userId)));

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.method === 'DELETE') {
    const checklistId = checklistsSubpath[0];

    if (!checklistId || checklistId === 'checklists') {
      return new Response(JSON.stringify({ error: 'Checklist ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // First check if the checklist exists and belongs to the user
    const [existingChecklist] = await db
      .select({ id: checklist_runs.id })
      .from(checklist_runs)
      .where(and(eq(checklist_runs.id, checklistId), eq(checklist_runs.user_id, userId)))
      .limit(1);

    if (!existingChecklist) {
      return new Response(JSON.stringify({ error: 'Checklist not found or unauthorized' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Now delete the checklist
    await db.delete(checklist_runs)
      .where(and(eq(checklist_runs.id, checklistId), eq(checklist_runs.user_id, userId)));

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
