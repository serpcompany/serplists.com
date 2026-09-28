import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { createDb, schema } from '../db';
import type { Env } from '../types';
import { getEntitlementsForContext, getEntitlementsForUser } from './entitlements';
import { insertRowWhere, rowExistsSql } from './guarded-insert';
import { jsonError } from './response';

// The Free plan's active-run limit. Every write that adds an in_progress run to a context
// (create, restore, and reopening a completed run through revalidate, PUT status, the share
// link, or MCP) checks it here, against the run's owner context rather than the actor.
// Creates and restores also repeat the check inside the write (activeRunCapacityAvailableSql),
// so concurrent requests cannot all pass the same count.

/** The context whose limit a run counts toward: its Organization, or its owner's Personal. */
export type RunOwnerContext = { userId: string; teamId: string | null };

export type ActiveRunLimitHit = { limit: number; current: number };

/** `limit` is null when the plan has no active-run limit; `hit` is set when already at it. */
export type ActiveRunCapacity = { limit: number | null; hit: ActiveRunLimitHit | null };

type Db = ReturnType<typeof createDb>;

/** The runs that count toward a context's active-run limit. */
export function activeRunsInContext(owner: RunOwnerContext): SQL {
  const { checklist_runs } = schema;
  const inContext = owner.teamId
    ? eq(checklist_runs.team_id, owner.teamId)
    : and(eq(checklist_runs.user_id, owner.userId), isNull(checklist_runs.team_id));
  return and(inContext, eq(checklist_runs.status, 'in_progress'), isNull(checklist_runs.deleted_at)) as SQL;
}

/** True while the context has fewer than `limit` active runs, evaluated inside a write. */
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

/** The context's active-run limit, and whether it is already reached (a fast pre-check). */
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

/**
 * Returns the limit and current count when the context's plan limits active runs and it is
 * already at the limit, or null when one more active run is allowed.
 */
export async function findActiveRunLimitHit(
  env: Env,
  owner: RunOwnerContext,
  actingUserId: string | null = null,
): Promise<ActiveRunLimitHit | null> {
  return (await checkActiveRunCapacity(env, owner, actingUserId)).hit;
}

/**
 * Batch statements that insert a new run and its audit row. With a limit, the run is inserted
 * only while the context is below it and the audit row only if the run was inserted; check the
 * first result with batchUpdateMissed.
 */
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

/** The 403 every web route returns at the limit; `action` completes "Upgrade to Pro to ...". */
export function activeRunLimitResponse(hit: ActiveRunLimitHit, action: 'create' | 'restore' | 'reopen'): Response {
  return jsonError(`Active run limit reached. Upgrade to Pro to ${action} more checklist runs.`, 403, {
    code: 'limit_reached',
    details: { limit: hit.limit, current: hit.current, resource: 'active_runs' },
  });
}

/** True when a write moves a run from any other status into in_progress. */
export function isReopening(currentStatus: unknown, nextStatus: unknown): boolean {
  return nextStatus === 'in_progress' && currentStatus !== 'in_progress';
}
