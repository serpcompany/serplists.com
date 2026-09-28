import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { createDb, schema } from '../db';
import type { Env } from '../types';
import { getEntitlementsForContext, getEntitlementsForUser } from './entitlements';
import { jsonError } from './response';

// The Free plan's active-run limit. Every write that adds an in_progress run to a context
// (create, restore, and reopening a completed run through revalidate, PUT status, the share
// link, or MCP) checks it here, against the run's owner context rather than the actor.

/** The context whose limit a run counts toward: its Organization, or its owner's Personal. */
export type RunOwnerContext = { userId: string; teamId: string | null };

export type ActiveRunLimitHit = { limit: number; current: number };

/** The runs that count toward a context's active-run limit. */
export function activeRunsInContext(owner: RunOwnerContext): SQL {
  const { checklist_runs } = schema;
  const inContext = owner.teamId
    ? eq(checklist_runs.team_id, owner.teamId)
    : and(eq(checklist_runs.user_id, owner.userId), isNull(checklist_runs.team_id));
  return and(inContext, eq(checklist_runs.status, 'in_progress'), isNull(checklist_runs.deleted_at)) as SQL;
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
  const entitlements = owner.teamId
    ? await getEntitlementsForContext(env, { type: 'team', teamId: owner.teamId, userId: actingUserId ?? owner.userId })
    : await getEntitlementsForUser(env, owner.userId);
  const limit = entitlements.limits.maxActiveRuns;
  if (entitlements.plan !== 'free' || !limit) return null;

  const [row] = await createDb(env)
    .select({ count: sql<number>`count(*)` })
    .from(schema.checklist_runs)
    .where(activeRunsInContext(owner))
    .limit(1);
  const current = row?.count ?? 0;
  return current >= limit ? { limit, current } : null;
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
