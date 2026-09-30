import { Env } from '../types';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { createDb, schema } from '../db';
import { json, jsonError } from '../utils/response';
import { parseHistoryLimit, selectAuditEventHistory, serializeHistoryEvent } from '../utils/history-queries';
import { canViewTeam, getActiveTeamMembership, normalizeTeamRole } from '../utils/team-access';
import { canViewRun, canViewRunHistory } from '../utils/run-access';
import { checklistRunSelectFor, getRunSubject, serializeChecklistRun } from '../utils/checklist-runs';
import { findHiddenShareLinkActors, HIDDEN_ACTOR } from '../utils/share-link-actors';

function isMissingHistoryReadTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table: audit_events/i.test(message);
}

export async function handleChecklistReads(
  env: Env,
  db: ReturnType<typeof createDb>,
  url: URL,
  userId: string,
  checklistsSubpath: string[],
): Promise<Response> {
  const { checklist_runs } = schema;

  // GET /api/checklists/:id/history
  if (checklistsSubpath[0] && checklistsSubpath[1] === 'history') {
    const checklistId = checklistsSubpath[0];
    const historyLimit = parseHistoryLimit(url.searchParams.get('limit'));
    const [checklist] = await db
      .select()
      .from(checklist_runs)
      .where(eq(checklist_runs.id, checklistId))
      .limit(1);

    if (!checklist || !(await canViewRunHistory(env, checklist as unknown as Record<string, unknown>, userId))) {
      return jsonError('Checklist not found', 404);
    }

    try {
      const eventRows = await selectAuditEventHistory(db, 'checklist_run', checklistId, historyLimit);
      const hideActor = await findHiddenShareLinkActors(env, {
        userId: checklist.user_id,
        teamId: checklist.team_id ?? null,
      }, eventRows);

      return json({
        checklistId,
        subject: getRunSubject(checklist as unknown as Record<string, unknown>, userId),
        events: eventRows.map((row) => {
          const event = serializeHistoryEvent(row);
          return hideActor(row) ? { ...event, actor: HIDDEN_ACTOR } : event;
        }),
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
