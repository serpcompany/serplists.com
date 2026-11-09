import { Env } from '../types';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { createDb, schema } from '../db';
import { json, jsonError } from '../utils/response';
import { parseHistoryLimit, selectAuditEventHistory, serializeHistoryEvent } from '../utils/history-queries';
import { canViewTeam, getActiveTeamMembership, normalizeTeamRole } from '../utils/team-access';
import { canViewRun, canViewRunHistory } from '../utils/run-access';
import { checklistRunSelectFor, getRunSubject } from '../utils/checklist-runs';
import {
  runListProvenanceSelect,
  runProvenanceSelect,
  serializeListedRun,
  serializeRunWithProvenance,
} from '../utils/run-provenance';
import { findHiddenShareLinkActors, HIDDEN_ACTOR } from '../utils/share-link-actors';

type Db = ReturnType<typeof createDb>;

function isMissingHistoryReadTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table: audit_events/i.test(message);
}

async function canListOrganizationRuns(env: Env, teamId: string, userId: string): Promise<boolean> {
  const membership = await getActiveTeamMembership(env, teamId, userId);
  return membership !== null && canViewTeam(normalizeTeamRole(membership.role));
}

async function readRunHistory(env: Env, db: Db, url: URL, userId: string, checklistId: string): Promise<Response> {
  const { checklistRuns } = schema;
  const historyLimit = parseHistoryLimit(url.searchParams.get('limit'));
  const [checklist] = await db
    .select()
    .from(checklistRuns)
    .where(eq(checklistRuns.id, checklistId))
    .limit(1);

  if (!checklist || !(await canViewRunHistory(env, checklist, userId))) {
    return jsonError('Checklist not found', 404);
  }
  const subject = getRunSubject(checklist, userId);

  try {
    const eventRows = await selectAuditEventHistory(db, 'checklist_run', checklistId, historyLimit);
    const hideActor = await findHiddenShareLinkActors(env, {
      userId: checklist.user_id,
      teamId: checklist.team_id ?? null,
    }, eventRows);

    return json({
      checklistId,
      subject,
      events: eventRows.map((row) => {
        const event = serializeHistoryEvent(row);
        return hideActor(row) ? { ...event, actor: HIDDEN_ACTOR } : event;
      }),
    });
  } catch (error) {
    if (isMissingHistoryReadTableError(error)) {
      return json({ checklistId, subject, events: [] });
    }

    throw error;
  }
}

async function readRun(env: Env, db: Db, userId: string, checklistId: string): Promise<Response> {
  const { checklistRuns } = schema;
  const [checklist] = await db
    .select({ ...checklistRunSelectFor(userId), ...runProvenanceSelect(userId) })
    .from(checklistRuns)
    .where(and(eq(checklistRuns.id, checklistId), isNull(checklistRuns.deleted_at)))
    .limit(1);

  if (!checklist || !(await canViewRun(env, checklist, userId))) {
    return jsonError('Checklist not found', 404);
  }

  return json(serializeRunWithProvenance(checklist));
}

async function listRuns(env: Env, db: Db, url: URL, userId: string, archived: boolean): Promise<Response> {
  const { checklistRuns } = schema;
  const teamId = url.searchParams.get('teamId');
  if (teamId && !(await canListOrganizationRuns(env, teamId, userId))) {
    return jsonError('Organization not found', 404);
  }
  const ownedByContext = teamId
    ? eq(checklistRuns.team_id, teamId)
    : and(eq(checklistRuns.user_id, userId), isNull(checklistRuns.team_id));

  const checklists = await db
    .select({ ...checklistRunSelectFor(userId), ...runListProvenanceSelect() })
    .from(checklistRuns)
    .where(and(ownedByContext, archived ? isNotNull(checklistRuns.deleted_at) : isNull(checklistRuns.deleted_at)))
    .orderBy(archived ? desc(checklistRuns.updated_at) : desc(checklistRuns.created_at));

  return json(checklists.map((run) => serializeListedRun(run)));
}

export async function handleChecklistReads(
  env: Env,
  db: Db,
  url: URL,
  userId: string,
  checklistsSubpath: string[],
): Promise<Response> {
  const [first, second] = checklistsSubpath;

  if (first && second === 'history') {
    return readRunHistory(env, db, url, userId, first);
  }

  if (first === 'archived') {
    return listRuns(env, db, url, userId, true);
  }

  if (first) {
    return readRun(env, db, userId, first);
  }

  return listRuns(env, db, url, userId, false);
}
