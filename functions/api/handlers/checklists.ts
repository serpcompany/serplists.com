import { Env } from '../types';
import { and, desc, eq, sql } from 'drizzle-orm';
import { createDb, schema } from '../db';
import { checklistPayloadSchema, normalizeSectionsPayload } from '../utils/payloads';
import { json, jsonError } from '../utils/response';
import { getSessionUserId } from '../utils/session';
import { getEntitlementsForUser } from '../utils/entitlements';

export async function handleChecklists(request: Request, env: Env): Promise<Response> {
  const userId = await getSessionUserId(request, env);
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean); // ["api", "checklists", ...]
  const checklistsSubpath = pathParts.slice(2); // after /api/checklists
  const db = createDb(env);
  const { checklist_runs } = schema;

  if (!userId) {
    return jsonError('Unauthorized', 401);
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
        return jsonError('Checklist not found', 404);
      }

      return json(checklist);
    }

    const checklists = await db
      .select()
      .from(checklist_runs)
      .where(eq(checklist_runs.user_id, userId))
      .orderBy(desc(checklist_runs.created_at));

    return json(checklists);
  }

  if (request.method === 'POST') {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError('Invalid JSON payload', 400);
    }

    const parsed = checklistPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || 'Invalid checklist payload', 400);
    }

    const entitlements = await getEntitlementsForUser(env, userId);
    if (entitlements.plan === 'free' && entitlements.limits.maxActiveRuns) {
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(checklist_runs)
        .where(and(eq(checklist_runs.user_id, userId), eq(checklist_runs.status, 'in_progress')))
        .limit(1);

      const currentCount = Number((row as any)?.count ?? 0);
      if (currentCount >= entitlements.limits.maxActiveRuns) {
        return jsonError('Active run limit reached. Upgrade to Pro to create more checklist runs.', 403, {
          code: 'limit_reached',
          details: { limit: entitlements.limits.maxActiveRuns, current: currentCount, resource: 'active_runs' },
        });
      }
    }

    const { template_id, title, items, sections, status } = parsed.data;
    const checklistId = crypto.randomUUID();
    const now = new Date().toISOString();

    const normalizedSections = normalizeSectionsPayload(sections ?? items);
    if (normalizedSections.error) {
      return jsonError(normalizedSections.error, 400);
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

    return json({ id: checklistId });
  }

  if (request.method === 'PUT') {
    const checklistId = checklistsSubpath[0];

    if (!checklistId || checklistId === 'checklists') {
      return jsonError('Checklist ID required', 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError('Invalid JSON payload', 400);
    }

    const parsed = checklistPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || 'Invalid checklist payload', 400);
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
        return jsonError(normalizedSections.error, 400);
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
      return jsonError('No fields to update', 400);
    }

    await db.update(checklist_runs)
      .set(updates)
      .where(and(eq(checklist_runs.id, checklistId), eq(checklist_runs.user_id, userId)));

    return json({ success: true });
  }

  if (request.method === 'DELETE') {
    const checklistId = checklistsSubpath[0];

    if (!checklistId || checklistId === 'checklists') {
      return jsonError('Checklist ID required', 400);
    }

    // First check if the checklist exists and belongs to the user
    const [existingChecklist] = await db
      .select({ id: checklist_runs.id })
      .from(checklist_runs)
      .where(and(eq(checklist_runs.id, checklistId), eq(checklist_runs.user_id, userId)))
      .limit(1);

    if (!existingChecklist) {
      return jsonError('Checklist not found or unauthorized', 404);
    }

    // Now delete the checklist
    await db.delete(checklist_runs)
      .where(and(eq(checklist_runs.id, checklistId), eq(checklist_runs.user_id, userId)));

    return json({ success: true });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
