import { Env } from '../types';
import { and, desc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { createDb, schema } from '../db';
import { checklistPayloadSchema, normalizeSectionsPayload, parseJsonArray } from '../utils/payloads';
import { json, jsonError } from '../utils/response';
import { getSessionUserId } from '../utils/session';
import { getEntitlementsForContext, getEntitlementsForUser } from '../utils/entitlements';
import { buildAuditEventValues, type AuditSubject } from '../utils/audit';
import { redactStoredAuditDiff } from '../utils/audit-compaction';
import { canManageTeam, canRunTeamTemplates, canViewTeam, getActiveTeamMembership, normalizeTeamRole } from '../utils/team-access';
import { z } from 'zod';
import { calculateRunProgress, reconcileRunSections } from '../utils/template-reconciliation';
import { batchUpdateMissed, checklistRunSelectFor, getRunSubject, serializeChecklistRun } from '../utils/checklist-runs';
import { canUseTemplateAsRunSource } from '../utils/template-access';
import {
  activeRunCapacityAvailableSql,
  activeRunLimitResponse,
  checkActiveRunCapacity,
  countActiveRuns,
  findActiveRunLimitHit,
  isReopening,
  runInsertStatements,
} from '../utils/active-run-limit';
import { insertRowWhere, rowExistsSql } from '../utils/guarded-insert';
import { handleSharedChecklist } from './checklists-shared';

function getRequestedTeamId(parsed: { teamId?: string; team_id?: string }, url: URL): string | null {
  return parsed.teamId ?? parsed.team_id ?? url.searchParams.get('teamId');
}

function isMissingHistoryReadTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table: audit_events/i.test(message);
}

function parseOptionalJson(value: unknown): unknown {
  if (typeof value !== 'string' || value.length === 0) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function resetCompletionState(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(resetCompletionState);
  }

  if (!isRecord(value)) {
    return value;
  }

  const next: Record<string, unknown> = { ...value };
  if (Object.prototype.hasOwnProperty.call(next, 'isCompleted')) {
    next.isCompleted = false;
  }
  if (Array.isArray(next.items)) {
    next.items = next.items.map(resetCompletionState);
  }
  if (Array.isArray(next.subItems)) {
    next.subItems = next.subItems.map(resetCompletionState);
  }

  return next;
}

async function canViewRun(env: Env, run: Record<string, unknown>, userId: string): Promise<boolean> {
  if (typeof run.deleted_at === 'string' && run.deleted_at) return false;
  if (typeof run.team_id === 'string' && run.team_id) {
    const membership = await getActiveTeamMembership(env, run.team_id, userId);
    return membership ? canViewTeam(normalizeTeamRole(membership.role)) : false;
  }

  return run.user_id === userId;
}

async function canViewRunHistory(env: Env, run: Record<string, unknown>, userId: string): Promise<boolean> {
  if (typeof run.team_id === 'string' && run.team_id) {
    const membership = await getActiveTeamMembership(env, run.team_id, userId);
    return membership ? canViewTeam(normalizeTeamRole(membership.role)) : false;
  }

  return run.user_id === userId;
}

async function canUpdateRun(env: Env, run: Record<string, unknown>, userId: string): Promise<boolean> {
  if (typeof run.deleted_at === 'string' && run.deleted_at) return false;
  if (typeof run.team_id === 'string' && run.team_id) {
    const membership = await getActiveTeamMembership(env, run.team_id, userId);
    return membership ? canRunTeamTemplates(normalizeTeamRole(membership.role)) : false;
  }

  return run.user_id === userId;
}

async function canDeleteRun(env: Env, run: Record<string, unknown>, userId: string): Promise<boolean> {
  if (typeof run.deleted_at === 'string' && run.deleted_at) return false;
  if (typeof run.team_id === 'string' && run.team_id) {
    const membership = await getActiveTeamMembership(env, run.team_id, userId);
    return membership ? canManageTeam(normalizeTeamRole(membership.role)) : false;
  }

  return run.user_id === userId;
}

async function canRestoreRun(env: Env, run: Record<string, unknown>, userId: string): Promise<boolean> {
  if (typeof run.team_id === 'string' && run.team_id) {
    const membership = await getActiveTeamMembership(env, run.team_id, userId);
    return membership ? canManageTeam(normalizeTeamRole(membership.role)) : false;
  }

  return run.user_id === userId;
}

async function assertTeamRunAccess(env: Env, teamId: string, userId: string): Promise<Response | null> {
  const membership = await getActiveTeamMembership(env, teamId, userId);
  if (!membership) return jsonError('Organization not found', 404);
  if (!canRunTeamTemplates(normalizeTeamRole(membership.role))) return jsonError('Forbidden', 403);
  return null;
}

async function resolveTemplateRunSource(
  env: Env,
  templateId: string,
  userId: string,
  requestedTeamId: string | null,
): Promise<{
  error?: Response;
  source?: {
    effectiveTeamId: string | null;
    sections: unknown[];
    title: string;
    version: number;
  };
}> {
  const db = createDb(env);
  const { templates } = schema;
  const [sourceTemplate] = await db
    .select({
      id: templates.id,
      user_id: templates.user_id,
      owner_type: templates.owner_type,
      team_id: templates.team_id,
      title: templates.title,
      items: templates.items,
      is_public: templates.is_public,
      version: templates.content_version,
    })
    .from(templates)
    .where(and(eq(templates.id, templateId), isNull(templates.deleted_at)))
    .limit(1);

  if (!sourceTemplate) {
    return { error: jsonError('Template not found', 404) };
  }

  const sourceTeamId = typeof sourceTemplate.team_id === 'string' && sourceTemplate.team_id
    ? sourceTemplate.team_id
    : null;
  const sourceIsPublic = Boolean(sourceTemplate.is_public);
  const isPrivateTeamTemplate = sourceTemplate.owner_type === 'team' && sourceTeamId && !sourceIsPublic;
  const effectiveTeamId = isPrivateTeamTemplate ? sourceTeamId : requestedTeamId;

  if (isPrivateTeamTemplate && requestedTeamId && requestedTeamId !== sourceTeamId) {
    return { error: jsonError('Template not found', 404) };
  }
  if (!canUseTemplateAsRunSource(sourceTemplate, { userId, runTeamId: effectiveTeamId })) {
    return { error: jsonError('Template not found', 404) };
  }

  const normalizedSections = normalizeSectionsPayload(parseJsonArray(sourceTemplate.items) ?? []);
  if (normalizedSections.error) {
    return { error: jsonError('Template content is invalid', 500) };
  }

  return {
    source: {
      effectiveTeamId,
      sections: resetCompletionState(normalizedSections.sections) as unknown[],
      title: sourceTemplate.title || '',
      version: typeof sourceTemplate.version === 'number' ? sourceTemplate.version : 1,
    },
  };
}

export async function handleChecklists(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean); // ["api", "checklists", ...]
  const checklistsSubpath = pathParts.slice(2); // after /api/checklists
  const db = createDb(env);
  const { audit_events, checklist_runs, templates, users } = schema;
  const shareToken = checklistsSubpath[1];
  const userId = await getSessionUserId(request, env);
  const isSharedRoute = checklistsSubpath[0] === 'shared';

  if (isSharedRoute) {
    if (!shareToken) {
      return jsonError('Share token required', 400);
    }

    return handleSharedChecklist(request, env, shareToken, userId);
  }

  if (!userId) {
    return jsonError('Unauthorized', 401);
  }

  if (request.method === 'GET') {
    // GET /api/checklists/:id/history
    if (checklistsSubpath[0] && checklistsSubpath[1] === 'history') {
      const checklistId = checklistsSubpath[0];
      const requestedLimit = Number(url.searchParams.get('limit') ?? '50');
      const historyLimit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
        : 50;
      const [checklist] = await db
        .select()
        .from(checklist_runs)
        .where(eq(checklist_runs.id, checklistId))
        .limit(1);

      if (!checklist || !(await canViewRunHistory(env, checklist as unknown as Record<string, unknown>, userId))) {
        return jsonError('Checklist not found', 404);
      }

      try {
        const eventRows = await db
          .select({
            id: audit_events.id,
            actor_user_id: audit_events.actor_user_id,
            subject_type: audit_events.subject_type,
            subject_id: audit_events.subject_id,
            resource_type: audit_events.resource_type,
            resource_id: audit_events.resource_id,
            action: audit_events.action,
            diff_json: audit_events.diff_json,
            metadata_json: audit_events.metadata_json,
            request_id: audit_events.request_id,
            created_at: audit_events.created_at,
            actor_email: users.email,
            actor_name: users.name,
            actor_username: users.username,
          })
          .from(audit_events)
          .leftJoin(users, eq(users.id, audit_events.actor_user_id))
          .where(and(eq(audit_events.resource_type, 'checklist_run'), eq(audit_events.resource_id, checklistId)))
          .orderBy(desc(audit_events.created_at))
          .limit(historyLimit);

        return json({
          checklistId,
          subject: getRunSubject(checklist as unknown as Record<string, unknown>, userId),
          events: eventRows.map((row) => ({
            id: row.id,
            action: row.action,
            createdAt: row.created_at,
            requestId: row.request_id,
            diff: redactStoredAuditDiff(parseOptionalJson(row.diff_json)),
            metadata: parseOptionalJson(row.metadata_json),
            actor: {
              userId: row.actor_user_id,
              email: row.actor_email,
              name: row.actor_name,
              username: row.actor_username,
            },
          })),
        });
      } catch (error) {
        if (isMissingHistoryReadTableError(error)) {
          return json({
            checklistId,
            subject: getRunSubject(checklist as unknown as Record<string, unknown>, userId),
            events: [],
          });
        }

        throw error;
      }
    }

    // GET /api/checklists/archived?teamId=...
    if (checklistsSubpath[0] === 'archived') {
      const teamId = url.searchParams.get('teamId');
      if (teamId) {
        const membership = await getActiveTeamMembership(env, teamId, userId);
        if (!membership || !canViewTeam(normalizeTeamRole(membership.role))) {
          return jsonError('Organization not found', 404);
        }

        const checklists = await db
          .select(checklistRunSelectFor(userId))
          .from(checklist_runs)
          .where(and(eq(checklist_runs.team_id, teamId), isNotNull(checklist_runs.deleted_at)))
          .orderBy(desc(checklist_runs.updated_at));

        return json(checklists.map((run) => serializeChecklistRun(run as unknown as Record<string, unknown>)));
      }

      const checklists = await db
        .select(checklistRunSelectFor(userId))
        .from(checklist_runs)
        .where(and(eq(checklist_runs.user_id, userId), isNull(checklist_runs.team_id), isNotNull(checklist_runs.deleted_at)))
        .orderBy(desc(checklist_runs.updated_at));

      return json(checklists.map((run) => serializeChecklistRun(run as unknown as Record<string, unknown>)));
    }

    // GET /api/checklists/:id
    if (checklistsSubpath[0]) {
      const checklistId = checklistsSubpath[0];
      const [checklist] = await db
        .select(checklistRunSelectFor(userId))
        .from(checklist_runs)
        .where(and(eq(checklist_runs.id, checklistId), isNull(checklist_runs.deleted_at)))
        .limit(1);

      if (!checklist || !(await canViewRun(env, checklist as unknown as Record<string, unknown>, userId))) {
        return jsonError('Checklist not found', 404);
      }

      return json(serializeChecklistRun(checklist as unknown as Record<string, unknown>));
    }

    const teamId = url.searchParams.get('teamId');
    if (teamId) {
      const membership = await getActiveTeamMembership(env, teamId, userId);
      if (!membership || !canViewTeam(normalizeTeamRole(membership.role))) {
        return jsonError('Organization not found', 404);
      }

      const checklists = await db
        .select(checklistRunSelectFor(userId))
        .from(checklist_runs)
        .where(and(eq(checklist_runs.team_id, teamId), isNull(checklist_runs.deleted_at)))
        .orderBy(desc(checklist_runs.created_at));

      return json(checklists.map((run) => serializeChecklistRun(run as unknown as Record<string, unknown>)));
    }

    const checklists = await db
      .select(checklistRunSelectFor(userId))
      .from(checklist_runs)
      .where(and(eq(checklist_runs.user_id, userId), isNull(checklist_runs.team_id), isNull(checklist_runs.deleted_at)))
      .orderBy(desc(checklist_runs.created_at));

    return json(checklists.map((run) => serializeChecklistRun(run as unknown as Record<string, unknown>)));
  }

  if (request.method === 'POST') {
    // POST /api/checklists/:id/restore
    if (checklistsSubpath[0] && checklistsSubpath[1] === 'restore') {
      const checklistId = checklistsSubpath[0];
      if (!checklistId || checklistId === 'checklists') {
        return jsonError('Checklist ID required', 400);
      }

      const [existingRun] = await db
        .select()
        .from(checklist_runs)
        .where(eq(checklist_runs.id, checklistId))
        .limit(1);
      const runRecord = existingRun as unknown as Record<string, unknown>;

      if (!existingRun || !(await canViewRunHistory(env, runRecord, userId))) {
        return jsonError('Checklist not found', 404);
      }
      if (!(await canRestoreRun(env, runRecord, userId))) {
        return jsonError('Forbidden', 403);
      }
      if (!(typeof runRecord.deleted_at === 'string' && runRecord.deleted_at)) {
        return jsonError('Checklist is not archived', 400);
      }

      const teamId = typeof runRecord.team_id === 'string' && runRecord.team_id ? runRecord.team_id : null;
      const owner = { userId, teamId };
      const capacity = runRecord.status === 'in_progress'
        ? await checkActiveRunCapacity(env, owner, userId)
        : { limit: null, hit: null };
      if (capacity.hit) return activeRunLimitResponse(capacity.hit, 'restore');

      const now = new Date().toISOString();
      const restoreUpdates = {
        deleted_at: null,
        updated_at: now,
        is_public: false,
        share_token: null,
        share_expires_at: null,
        share_used_at: null,
      };

      const auditEvent = await buildAuditEventValues({
        actorUserId: userId,
        subject: getRunSubject(runRecord, userId),
        resource: { type: 'checklist_run', id: checklistId },
        action: 'checklist_run.restored',
        before: runRecord,
        after: { ...runRecord, ...restoreUpdates },
        diff: restoreUpdates,
        request,
        createdAt: now,
      });
      const archivedRun = teamId
        ? and(eq(checklist_runs.id, checklistId), eq(checklist_runs.team_id, teamId), isNotNull(checklist_runs.deleted_at))
        : and(eq(checklist_runs.id, checklistId), eq(checklist_runs.user_id, userId), isNotNull(checklist_runs.deleted_at));
      // With a limit, the restore re-checks it in the same statement and the audit row is
      // written only if this request restored the run.
      const batchResults = await db.batch(capacity.limit === null
        ? [db.update(checklist_runs).set(restoreUpdates).where(archivedRun), db.insert(audit_events).values(auditEvent)]
        : [
            db.update(checklist_runs).set(restoreUpdates).where(and(archivedRun, activeRunCapacityAvailableSql(owner, capacity.limit))),
            insertRowWhere(db, audit_events, auditEvent, rowExistsSql(checklist_runs.id, checklistId, and(isNull(checklist_runs.deleted_at), eq(checklist_runs.updated_at, now)))),
          ]);
      if (capacity.limit !== null && batchUpdateMissed(batchResults[0])) {
        const current = await countActiveRuns(env, owner);
        if (current >= capacity.limit) return activeRunLimitResponse({ limit: capacity.limit, current }, 'restore');
      }

      return json({ success: true });
    }

    // POST /api/checklists/:id/revalidate
    if (checklistsSubpath[0] && checklistsSubpath[1] === 'revalidate') {
      const checklistId = checklistsSubpath[0];
      let body: unknown = {};
      try {
        body = await request.json();
      } catch {
        // An empty body is valid for explicit revalidation.
      }
      const revalidateBody = z.object({
        expected_revision: z.number().int().positive().optional(),
      }).safeParse(body);
      if (!revalidateBody.success) {
        return jsonError(revalidateBody.error.issues[0]?.message || 'Invalid revalidation payload', 400);
      }

      const [existingRun] = await db
        .select()
        .from(checklist_runs)
        .where(and(eq(checklist_runs.id, checklistId), isNull(checklist_runs.deleted_at)))
        .limit(1);
      if (!existingRun || !(await canViewRun(env, existingRun as unknown as Record<string, unknown>, userId))) {
        return jsonError('Checklist not found', 404);
      }
      if (!(await canUpdateRun(env, existingRun as unknown as Record<string, unknown>, userId))) {
        return jsonError('Forbidden', 403);
      }
      if (existingRun.is_public) {
        return jsonError('Shared runs must be made private before revalidation.', 409, { code: 'shared_run_conflict' });
      }
      if (!existingRun.template_id) {
        return jsonError('Checklist run is not linked to a template.', 400);
      }

      const currentRevision = typeof existingRun.revision === 'number' ? existingRun.revision : 1;
      if (typeof revalidateBody.data.expected_revision === 'number' && revalidateBody.data.expected_revision !== currentRevision) {
        return jsonError('Checklist run changed since it was loaded. Refresh before revalidating.', 409, {
          code: 'edit_conflict',
          details: { expectedRevision: revalidateBody.data.expected_revision, currentRevision },
        });
      }

      const [sourceTemplate] = await db
        .select({
          id: templates.id,
          items: templates.items,
          version: templates.content_version,
          is_public: templates.is_public,
          owner_type: templates.owner_type,
          team_id: templates.team_id,
          user_id: templates.user_id,
        })
        .from(templates)
        .where(and(eq(templates.id, existingRun.template_id), isNull(templates.deleted_at)))
        .limit(1);
      // Same answer whether the template is gone or no longer usable here, so the
      // response does not reveal that a private template exists.
      if (!sourceTemplate || !canUseTemplateAsRunSource(sourceTemplate, { userId, runTeamId: existingRun.team_id ?? null })) {
        return jsonError('Source template not found', 404);
      }
      // Revalidation always leaves the run in_progress, which reopens a completed run.
      if (isReopening(existingRun.status, 'in_progress')) {
        const limitHit = await findActiveRunLimitHit(env, { userId: existingRun.user_id, teamId: existingRun.team_id ?? null }, userId);
        if (limitHit) return activeRunLimitResponse(limitHit, 'reopen');
      }

      const previousSections = parseJsonArray(existingRun.items) ?? [];
      const previousRetired = parseJsonArray(existingRun.retired_items) ?? [];
      const templateSections = parseJsonArray(sourceTemplate.items) ?? [];
      const reconciled = reconcileRunSections(previousSections, templateSections, previousRetired);
      const now = new Date().toISOString();
      const updates = {
        items: JSON.stringify(reconciled.sections),
        retired_items: JSON.stringify(reconciled.retired),
        progress: calculateRunProgress(reconciled.sections),
        template_version: typeof sourceTemplate.version === 'number' ? sourceTemplate.version : 1,
        revision: currentRevision + 1,
        status: 'in_progress',
        completed_at: null,
        completed_by_user_id: null,
        updated_at: now,
      };
      const auditEvent = await buildAuditEventValues({
        actorUserId: userId,
        subject: getRunSubject(existingRun as unknown as Record<string, unknown>, userId),
        resource: { type: 'checklist_run', id: checklistId },
        action: 'checklist_run.revalidated',
        before: existingRun as unknown as Record<string, unknown>,
        after: { ...(existingRun as unknown as Record<string, unknown>), ...updates },
        diff: updates,
        request,
        createdAt: now,
      });
      const batchResults = await db.batch([
        db.update(checklist_runs).set(updates).where(and(
          eq(checklist_runs.id, checklistId),
          eq(checklist_runs.revision, currentRevision),
          isNull(checklist_runs.deleted_at),
        )),
        db.insert(audit_events).values(auditEvent),
      ]);

      if (batchUpdateMissed(batchResults[0])) {
        return jsonError('Checklist run changed while it was being revalidated. Refresh and try again.', 409, {
          code: 'edit_conflict',
        });
      }

      return json({
        success: true,
        progress: updates.progress,
        revision: updates.revision,
        template_version: updates.template_version,
      });
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

    const isTemplateShareRequest = checklistsSubpath.length === 2 && checklistsSubpath[1] === 'share' && checklistsSubpath[0] !== 'run';
    if (isTemplateShareRequest) {
      const templateId = checklistsSubpath[0];
      if (!templateId || templateId === 'checklists') {
        return jsonError('Template ID required', 400);
      }

      const shareBody = z.object({
        runName: z.string().trim().max(160).optional(),
        teamId: z.string().trim().min(1).optional(),
        team_id: z.string().trim().min(1).optional(),
      }).safeParse(body);
      if (!shareBody.success) {
        return jsonError(shareBody.error.issues[0]?.message || 'Invalid share payload', 400);
      }

      const [sourceTemplate] = await db
        .select({
          id: templates.id,
          user_id: templates.user_id,
          owner_type: templates.owner_type,
          team_id: templates.team_id,
          title: templates.title,
          items: templates.items,
          is_public: templates.is_public,
          version: templates.content_version,
        })
        .from(templates)
        .where(and(eq(templates.id, templateId), isNull(templates.deleted_at)))
        .limit(1);

      if (!sourceTemplate) {
        return jsonError('Template not found', 404);
      }

      const requestedTeamId = getRequestedTeamId(shareBody.data, url);
      const sourceTeamId = typeof sourceTemplate.team_id === 'string' && sourceTemplate.team_id
        ? sourceTemplate.team_id
        : null;
      const sourceIsPublic = Boolean(sourceTemplate.is_public);
      const sourceIsPrivateTeamTemplate = sourceTemplate.owner_type === 'team' && sourceTeamId && !sourceIsPublic;
      let effectiveTeamId: string | null = null;

      if (sourceIsPrivateTeamTemplate) {
        if (requestedTeamId && requestedTeamId !== sourceTeamId) {
          return jsonError('Template not found', 404);
        }

        const accessError = await assertTeamRunAccess(env, sourceTeamId, userId);
        if (accessError) return accessError;
        effectiveTeamId = sourceTeamId;
      } else {
        if (!canUseTemplateAsRunSource(sourceTemplate, { userId, runTeamId: requestedTeamId })) {
          return jsonError('Template not found', 404);
        }

        if (requestedTeamId) {
          const accessError = await assertTeamRunAccess(env, requestedTeamId, userId);
          if (accessError) return accessError;
          effectiveTeamId = requestedTeamId;
        }
      }

      const now = new Date().toISOString();

      const entitlements = effectiveTeamId
        ? await getEntitlementsForContext(env, { type: 'team', teamId: effectiveTeamId, userId })
        : await getEntitlementsForUser(env, userId);
      if (entitlements.plan === 'free' && entitlements.limits.maxActiveRuns) {
        const [row] = await db
          .select({ count: sql<number>`count(*)` })
          .from(checklist_runs)
          .where(
            effectiveTeamId
              ? and(
                  eq(checklist_runs.team_id, effectiveTeamId),
                  eq(checklist_runs.status, 'in_progress'),
                  or(eq(checklist_runs.is_public, false), isNull(checklist_runs.is_public)),
                  isNull(checklist_runs.deleted_at),
                )
              : and(
                  eq(checklist_runs.user_id, userId),
                  isNull(checklist_runs.team_id),
                  eq(checklist_runs.status, 'in_progress'),
                  or(eq(checklist_runs.is_public, false), isNull(checklist_runs.is_public)),
                  isNull(checklist_runs.deleted_at),
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

      const insertedRun = {
        id: checklistId,
        user_id: userId,
        team_id: effectiveTeamId,
        template_id: templateId,
        title: runName,
        items: JSON.stringify(normalizedSections.sections),
        status: 'in_progress',
        started_at: now,
        created_by_user_id: userId,
        started_by_user_id: userId,
        created_at: now,
        is_public: true,
        share_token: shareToken,
        template_version: typeof sourceTemplate.version === 'number' ? sourceTemplate.version : 1,
        revision: 1,
        retired_items: '[]',
      };
      const subject: AuditSubject = effectiveTeamId
        ? { type: 'team', id: effectiveTeamId }
        : { type: 'user', id: userId };

      const auditEvent = await buildAuditEventValues({
        actorUserId: userId,
        subject,
        resource: { type: 'checklist_run', id: checklistId },
        action: 'checklist_run.share_created',
        after: insertedRun,
        metadata: { source: 'template_share', templateId },
        request,
        createdAt: now,
      });
      await db.batch([
        db
          .update(checklist_runs)
          .set({
            status: 'completed',
            completed_at: now,
            is_public: false,
            share_expires_at: now,
            share_used_at: now,
          })
          .where(
            effectiveTeamId
              ? and(
                  eq(checklist_runs.team_id, effectiveTeamId),
                  eq(checklist_runs.template_id, templateId),
                  eq(checklist_runs.is_public, true),
                  isNull(checklist_runs.deleted_at),
                )
              : and(
                  eq(checklist_runs.user_id, userId),
                  isNull(checklist_runs.team_id),
                  eq(checklist_runs.template_id, templateId),
                  eq(checklist_runs.is_public, true),
                  isNull(checklist_runs.deleted_at),
                )
          ),
        db.insert(checklist_runs).values(insertedRun),
        db.insert(audit_events).values(auditEvent),
      ]);

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
        .where(and(eq(checklist_runs.id, runId), isNull(checklist_runs.deleted_at)))
        .limit(1);

      if (!run || !(await canViewRun(env, run as unknown as Record<string, unknown>, userId))) {
        return jsonError('Checklist run not found', 404);
      }
      if (!(await canUpdateRun(env, run as unknown as Record<string, unknown>, userId))) {
        return jsonError('Forbidden', 403);
      }

      const now = new Date().toISOString();
      const shareToken = crypto.randomUUID();
      const shareUpdates = {
        is_public: true,
        share_token: shareToken,
        share_expires_at: now,
        share_used_at: null,
      };

      const auditEvent = await buildAuditEventValues({
        actorUserId: userId,
        subject: getRunSubject(run as unknown as Record<string, unknown>, userId),
        resource: { type: 'checklist_run', id: runId },
        action: 'checklist_run.share_created',
        before: run as unknown as Record<string, unknown>,
        after: { ...(run as unknown as Record<string, unknown>), ...shareUpdates },
        diff: shareUpdates,
        request,
        createdAt: now,
      });
      await db.batch([
        db
          .update(checklist_runs)
          .set({
            is_public: false,
            share_token: null,
            share_expires_at: null,
            share_used_at: null,
          })
          .where(and(eq(checklist_runs.id, runId), eq(checklist_runs.is_public, true), isNull(checklist_runs.deleted_at))),
        db
          .update(checklist_runs)
          .set(shareUpdates)
          .where(
            run.team_id
              ? and(eq(checklist_runs.id, runId), eq(checklist_runs.team_id, run.team_id), isNull(checklist_runs.deleted_at))
              : and(eq(checklist_runs.id, runId), eq(checklist_runs.user_id, userId), isNull(checklist_runs.deleted_at)),
          ),
        db.insert(audit_events).values(auditEvent),
      ]);

      return json({
        id: runId,
        shareToken,
        sharePath: `/share/${shareToken}`,
      });
    }

    const { template_id, title, items, sections, status, teamId: payloadTeamId, team_id: payloadTeamIdSnake } = parsed.data;
    const requestedTeamId = getRequestedTeamId({ teamId: payloadTeamId, team_id: payloadTeamIdSnake }, url);
    const templateRunSource = template_id
      ? await resolveTemplateRunSource(env, template_id, userId, requestedTeamId)
      : {};
    if (templateRunSource.error) {
      return templateRunSource.error;
    }

    const effectiveTeamId = templateRunSource.source?.effectiveTeamId ?? requestedTeamId;
    if (effectiveTeamId) {
      const accessError = await assertTeamRunAccess(env, effectiveTeamId, userId);
      if (accessError) return accessError;
    }

    const owner = { userId, teamId: effectiveTeamId };
    const capacity = await checkActiveRunCapacity(env, owner, userId);
    if (capacity.hit) return activeRunLimitResponse(capacity.hit, 'create');

    const checklistId = crypto.randomUUID();
    const now = new Date().toISOString();

    const normalizedSections = templateRunSource.source
      ? { sections: templateRunSource.source.sections }
      : normalizeSectionsPayload(sections ?? items);
    if (normalizedSections.error) {
      return jsonError(normalizedSections.error, 400);
    }

    const insertedRun = {
      id: checklistId,
      user_id: userId,
      team_id: effectiveTeamId,
      template_id: template_id ?? null,
      title: title || templateRunSource.source?.title || '',
      items: JSON.stringify(normalizedSections.sections),
      status: status || 'in_progress',
      started_at: now,
      created_by_user_id: userId,
      started_by_user_id: userId,
      created_at: now,
      template_version: templateRunSource.source?.version ?? 1,
      revision: 1,
      retired_items: '[]',
    };

    const auditEvent = await buildAuditEventValues({
      actorUserId: userId,
      subject: effectiveTeamId ? { type: 'team', id: effectiveTeamId } : { type: 'user', id: userId },
      resource: { type: 'checklist_run', id: checklistId },
      action: 'checklist_run.created',
      after: insertedRun,
      request,
      createdAt: now,
    });
    const batchResults = await db.batch(runInsertStatements(db, insertedRun, auditEvent, owner, capacity.limit));
    if (capacity.limit !== null && batchUpdateMissed(batchResults[0])) {
      return activeRunLimitResponse({ limit: capacity.limit, current: await countActiveRuns(env, owner) }, 'create');
    }

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

    const { title, items, sections, status, progress, completed_at, expected_revision } = parsed.data;
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

    const [existingRun] = await db
      .select()
      .from(checklist_runs)
      .where(and(eq(checklist_runs.id, checklistId), isNull(checklist_runs.deleted_at)))
      .limit(1);

    if (!existingRun || !(await canViewRun(env, existingRun as unknown as Record<string, unknown>, userId))) {
      return jsonError('Checklist not found', 404);
    }
    if (!(await canUpdateRun(env, existingRun as unknown as Record<string, unknown>, userId))) {
      return jsonError('Forbidden', 403);
    }

    const currentRevision = typeof existingRun.revision === 'number' ? existingRun.revision : 1;
    if (typeof expected_revision === 'number' && expected_revision !== currentRevision) {
      return jsonError('Checklist run changed since it was loaded. Refresh before saving again.', 409, {
        code: 'edit_conflict',
        details: { expectedRevision: expected_revision, currentRevision },
      });
    }
    // Only a real reopen counts: the run page sends the current status with every save.
    if (isReopening(existingRun.status, status)) {
      const limitHit = await findActiveRunLimitHit(env, { userId: existingRun.user_id, teamId: existingRun.team_id ?? null }, userId);
      if (limitHit) return activeRunLimitResponse(limitHit, 'reopen');
    }

    const now = new Date().toISOString();
    updates.updated_at = now;
    updates.revision = currentRevision + 1;
    if (status === 'completed') {
      updates.completed_by_user_id = userId;
      if (!Object.prototype.hasOwnProperty.call(rawBody, 'completed_at')) {
        updates.completed_at = now;
      }
    }

    const auditEvent = await buildAuditEventValues({
      actorUserId: userId,
      subject: getRunSubject(existingRun as unknown as Record<string, unknown>, userId),
      resource: { type: 'checklist_run', id: checklistId },
      action: 'checklist_run.updated',
      before: existingRun as unknown as Record<string, unknown>,
      after: { ...(existingRun as unknown as Record<string, unknown>), ...updates },
      diff: updates,
      request,
      createdAt: now,
    });
    const batchResults = await db.batch([
      db.update(checklist_runs)
        .set(updates)
        .where(
          existingRun.team_id
            ? and(eq(checklist_runs.id, checklistId), eq(checklist_runs.team_id, existingRun.team_id), eq(checklist_runs.revision, currentRevision), isNull(checklist_runs.deleted_at))
            : and(eq(checklist_runs.id, checklistId), eq(checklist_runs.user_id, userId), eq(checklist_runs.revision, currentRevision), isNull(checklist_runs.deleted_at))
        ),
      db.insert(audit_events).values(auditEvent),
    ]);

    if (batchUpdateMissed(batchResults[0])) {
      return jsonError('Checklist run changed while it was being saved. Refresh before saving again.', 409, {
        code: 'edit_conflict',
      });
    }

    return json({ success: true, revision: currentRevision + 1 });
  }

  if (request.method === 'DELETE') {
    const checklistId = checklistsSubpath[0];

    if (!checklistId || checklistId === 'checklists') {
      return jsonError('Checklist ID required', 400);
    }

    // First check if the checklist exists and belongs to the user or team.
    const [existingChecklist] = await db
      .select()
      .from(checklist_runs)
      .where(eq(checklist_runs.id, checklistId))
      .limit(1);

    if (!existingChecklist || !(await canViewRun(env, existingChecklist as unknown as Record<string, unknown>, userId))) {
      return jsonError('Checklist not found or unauthorized', 404);
    }
    if (!(await canDeleteRun(env, existingChecklist as unknown as Record<string, unknown>, userId))) {
      return jsonError('Forbidden', 403);
    }

    const now = new Date().toISOString();
    const archiveUpdates = {
      deleted_at: now,
      updated_at: now,
      is_public: false,
      share_token: null,
      share_expires_at: null,
      share_used_at: null,
    };

    const archivedChecklist = {
      ...(existingChecklist as unknown as Record<string, unknown>),
      ...archiveUpdates,
    };

    const auditEvent = await buildAuditEventValues({
      actorUserId: userId,
      subject: getRunSubject(existingChecklist as unknown as Record<string, unknown>, userId),
      resource: { type: 'checklist_run', id: checklistId },
      action: 'checklist_run.deleted',
      before: existingChecklist as unknown as Record<string, unknown>,
      after: archivedChecklist,
      diff: archiveUpdates,
      request,
      createdAt: now,
    });
    await db.batch([
      db.update(checklist_runs)
        .set(archiveUpdates)
        .where(
          existingChecklist.team_id
            ? and(eq(checklist_runs.id, checklistId), eq(checklist_runs.team_id, existingChecklist.team_id), isNull(checklist_runs.deleted_at))
            : and(eq(checklist_runs.id, checklistId), eq(checklist_runs.user_id, userId), isNull(checklist_runs.deleted_at))
        ),
      db.insert(audit_events).values(auditEvent),
    ]);

    return json({ success: true });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
