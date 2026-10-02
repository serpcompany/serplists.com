import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { createDb, schema } from '../db';
import type { Env } from '../types';
import { getEntitlementsForContext, getEntitlementsForUser } from './entitlements';
import { allConditions, insertRowWhere, rowExistsSql } from './guarded-insert';
import { limitReachedResponse } from './limit-reached';

export type RunOwnerContext = { userId: string; teamId: string | null };

export type ActiveRunLimitHit = { limit: number; current: number };

export type ActiveRunCapacity = { limit: number | null; hit: ActiveRunLimitHit | null };

type Db = ReturnType<typeof createDb>;

export function activeRunsInContext(owner: RunOwnerContext): SQL {
  const { checklist_runs } = schema;
  const inContext = owner.teamId
    ? eq(checklist_runs.team_id, owner.teamId)
    : and(eq(checklist_runs.user_id, owner.userId), isNull(checklist_runs.team_id));
  return allConditions(inContext, eq(checklist_runs.status, 'in_progress'), isNull(checklist_runs.deleted_at));
}

export function activeRunCapacityAvailableSql(owner: RunOwnerContext, limit: number): SQL {
  return sql`(select count(*) from ${schema.checklist_runs} where ${activeRunsInContext(owner)}) < ${limit}`;
}

export async function countActiveRuns(env: Env, owner: RunOwnerContext): Promise<number> {
  const [row] = await createDb(env)
    .select({ count: sql<number>`count(*)` })
    .from(schema.checklist_runs)
    .where(activeRunsInContext(owner))
    .limit(1);
  return row?.count ?? 0;
}

export async function checkActiveRunCapacity(
  env: Env,
  owner: RunOwnerContext,
  actingUserId: string | null = null,
): Promise<ActiveRunCapacity> {
  const entitlements = owner.teamId
    ? await getEntitlementsForContext(env, { type: 'team', teamId: owner.teamId, userId: actingUserId ?? owner.userId })
    : await getEntitlementsForUser(env, owner.userId);
  const limit = entitlements.limits.maxActiveRuns;
  if (entitlements.plan !== 'free' || !limit) return { limit: null, hit: null };

  const current = await countActiveRuns(env, owner);
  return { limit, hit: current >= limit ? { limit, current } : null };
}

export async function findActiveRunLimitHit(
  env: Env,
  owner: RunOwnerContext,
  actingUserId: string | null = null,
): Promise<ActiveRunLimitHit | null> {
  return (await checkActiveRunCapacity(env, owner, actingUserId)).hit;
}

export function runInsertStatements(
  db: Db,
  run: typeof schema.checklist_runs.$inferInsert & { id: string },
  auditEvent: typeof schema.audit_events.$inferInsert,
  owner: RunOwnerContext,
  limit: number | null,
) {
  const { audit_events, checklist_runs } = schema;
  if (limit === null) {
    return [db.insert(checklist_runs).values(run), db.insert(audit_events).values(auditEvent)] as const;
  }
  return [
    insertRowWhere(db, checklist_runs, run, activeRunCapacityAvailableSql(owner, limit)),
    insertRowWhere(db, audit_events, auditEvent, rowExistsSql(checklist_runs.id, run.id)),
  ] as const;
}

export function activeRunLimitResponse(
  owner: RunOwnerContext,
  hit: ActiveRunLimitHit,
  action: 'create' | 'restore' | 'reopen',
): Response {
  return limitReachedResponse({ resource: 'active_runs', teamId: owner.teamId, action, ...hit });
}

export function isReopening(currentStatus: unknown, nextStatus: unknown): boolean {
  return nextStatus === 'in_progress' && currentStatus !== 'in_progress';
}

export async function reopenLimitResponse(
  env: Env,
  run: Pick<typeof schema.checklist_runs.$inferSelect, 'status' | 'team_id' | 'user_id'>,
  nextStatus: unknown,
  actingUserId: string | null,
): Promise<Response | null> {
  if (!isReopening(run.status, nextStatus)) return null;
  const owner = { userId: run.user_id, teamId: run.team_id ?? null };
  const hit = await findActiveRunLimitHit(env, owner, actingUserId);
  return hit ? activeRunLimitResponse(owner, hit, 'reopen') : null;
}
