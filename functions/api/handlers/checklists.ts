import { Env } from '../types';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { createDb, schema } from '../db';
import { checklistPayloadSchema, normalizeSectionsPayload, parseJsonArray } from '../utils/payloads';
import { json, jsonError } from '../utils/response';
import { getSessionUserId } from '../utils/session';
import { getEntitlementsForUser } from '../utils/entitlements';
import { z } from 'zod';

export async function handleChecklists(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean); // ["api", "checklists", ...]
  const checklistsSubpath = pathParts.slice(2); // after /api/checklists
  const db = createDb(env);
  const { checklist_runs, templates } = schema;
  const shareToken = checklistsSubpath[1];
  const userId = await getSessionUserId(request, env);
  const isSharedRoute = checklistsSubpath[0] === 'shared';

  if (isSharedRoute) {
    if (!shareToken) {
      return jsonError('Share token required', 400);
    }

    if (request.method === 'GET') {
      const [checklist] = await db
        .select()
        .from(checklist_runs)
        .where(and(eq(checklist_runs.share_token, shareToken), eq(checklist_runs.is_public, true)))
        .limit(1);

      if (!checklist) {
        return jsonError('Shared run not found', 404);
      }

      return json(checklist);
    }

    if (request.method === 'PUT') {
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

      const { sections, items, status, progress, completed_at } = parsed.data;
      const rawBody = body as Record<string, unknown>;

      const updates: Record<string, unknown> = {};
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

      if (status === 'completed') {
        updates.share_used_at = new Date().toISOString();
      }

      await db
        .update(checklist_runs)
        .set(updates)
        .where(and(eq(checklist_runs.share_token, shareToken), eq(checklist_runs.is_public, true)));

      return json({ success: true });
    }

    return new Response('Method Not Allowed', { status: 405 });
  }

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

    const isTemplateShareRequest = checklistsSubpath.length === 2 && checklistsSubpath[1] === 'share' && checklistsSubpath[0] !== 'run';
    if (isTemplateShareRequest) {
      const templateId = checklistsSubpath[0];
      if (!templateId || templateId === 'checklists') {
        return jsonError('Template ID required', 400);
      }

      const shareBody = z.object({ runName: z.string().optional() }).safeParse(parsed.data);
      if (!shareBody.success) {
        return jsonError(shareBody.error.issues[0]?.message || 'Invalid share payload', 400);
      }

      const [sourceTemplate] = await db
        .select({
          id: templates.id,
          title: templates.title,
          items: templates.items,
        })
        .from(templates)
        .where(and(eq(templates.id, templateId), eq(templates.user_id, userId)))
        .limit(1);

      if (!sourceTemplate) {
        return jsonError('Template not found', 404);
      }

      const now = new Date().toISOString();

      await db
        .update(checklist_runs)
        .set({
          status: 'completed',
          completed_at: now,
          is_public: false,
          share_expires_at: now,
          share_used_at: now,
        })
        .where(
          and(
            eq(checklist_runs.user_id, userId),
            eq(checklist_runs.template_id, templateId),
            eq(checklist_runs.is_public, true)
          )
        );

      const entitlements = await getEntitlementsForUser(env, userId);
      if (entitlements.plan === 'free' && entitlements.limits.maxActiveRuns) {
        const [row] = await db
          .select({ count: sql<number>`count(*)` })
          .from(checklist_runs)
          .where(
            and(
              eq(checklist_runs.user_id, userId),
              eq(checklist_runs.status, 'in_progress'),
              or(eq(checklist_runs.is_public, false), isNull(checklist_runs.is_public))
            )
          )
          .limit(1);

        const currentCount = row?.count ?? 0;
        if (currentCount >= entitlements.limits.maxActiveRuns) {
          return jsonError('Active run limit reached. Upgrade to Pro to create more checklist runs.', 403, {
            code: 'limit_reached',
            details: { limit: entitlements.limits.maxActiveRuns, current: currentCount, resource: 'active_runs' },
          });
        }
      }

      const sourceItems = parseJsonArray(sourceTemplate.items) ?? [];
      const normalizedSections = normalizeSectionsPayload(sourceItems);
      if (normalizedSections.error) {
        return jsonError(normalizedSections.error, 400);
      }

      const shareToken = crypto.randomUUID();
      const checklistId = crypto.randomUUID();
      const runName = shareBody.data.runName?.trim() || sourceTemplate.title;

      await db.insert(checklist_runs).values({
        id: checklistId,
        user_id: userId,
        template_id: templateId,
        title: runName,
        items: JSON.stringify(normalizedSections.sections),
        status: 'in_progress',
        started_at: now,
        created_at: now,
        is_public: true,
        share_token: shareToken,
      });

      return json({
        id: checklistId,
        shareToken,
        sharePath: `/share/${shareToken}`,
      });
    }

    const isRunShareRequest = checklistsSubpath.length === 3 && checklistsSubpath[0] === 'run' && checklistsSubpath[2] === 'share';
    if (isRunShareRequest) {
      const runId = checklistsSubpath[1];
      if (!runId || runId === 'run') {
        return jsonError('Checklist run ID required', 400);
      }

      const [run] = await db
        .select()
        .from(checklist_runs)
        .where(and(eq(checklist_runs.id, runId), eq(checklist_runs.user_id, userId)))
        .limit(1);

      if (!run) {
        return jsonError('Checklist run not found', 404);
      }

      const now = new Date().toISOString();
      const shareToken = crypto.randomUUID();

      await db
        .update(checklist_runs)
        .set({
          is_public: false,
          share_token: null,
          share_expires_at: null,
          share_used_at: null,
        })
        .where(and(eq(checklist_runs.id, runId), eq(checklist_runs.user_id, userId), eq(checklist_runs.is_public, true)));

      await db
        .update(checklist_runs)
        .set({
          is_public: true,
          share_token: shareToken,
          share_expires_at: now,
          share_used_at: null,
        })
        .where(and(eq(checklist_runs.id, runId), eq(checklist_runs.user_id, userId)));

      return json({
        id: runId,
        shareToken,
        sharePath: `/share/${shareToken}`,
      });
    }

    const entitlements = await getEntitlementsForUser(env, userId);
    if (entitlements.plan === 'free' && entitlements.limits.maxActiveRuns) {
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(checklist_runs)
        .where(and(eq(checklist_runs.user_id, userId), eq(checklist_runs.status, 'in_progress')))
        .limit(1);

      const currentCount = row?.count ?? 0;
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
