import { and, eq, inArray } from 'drizzle-orm';
import { createDb, schema } from '../db';
import type { Env } from '../types';

// Share-link visitors are guests. An edit through a share link names its actor only when
// the signed-in visitor already belongs to the run's owner context (the Personal owner, or an
// active member of its Organization); anyone else is recorded as no one, so posting a link
// cannot be used to collect the names and emails of people who use it. Rows written before
// that rule may name outsiders, so history reads hide the actor of those share-link rows too.

/** The context a run belongs to: its Organization, or its owner's Personal context. */
export type RunOwnerScope = { userId: string | null; teamId: string | null };

type AuditActorRow = { actor_user_id: string | null; metadata_json: string | null };

export const HIDDEN_ACTOR = { userId: null, email: null, name: null, username: null } as const;

function isShareLinkEvent(metadataJson: string | null): boolean {
  if (!metadataJson) return false;
  try {
    const metadata = JSON.parse(metadataJson) as unknown;
    return typeof metadata === 'object' && metadata !== null && (metadata as { source?: unknown }).source === 'public_share';
  } catch {
    return false;
  }
}

/**
 * A predicate that says which rows of `rows` must hide their actor: share-link events whose
 * actor is outside `owner`'s context. Other events keep their actor even when the same person
 * also has a hidden share-link event, so an ordinary edit's attribution never depends on which
 * other rows are in the page. Costs one indexed membership read for an Organization, and none
 * when no share-link event names anyone.
 */
export async function findHiddenShareLinkActors(
  env: Env,
  owner: RunOwnerScope,
  rows: AuditActorRow[],
): Promise<(row: AuditActorRow) => boolean> {
  const shareLinkRows = new Set(rows.filter((row) => row.actor_user_id && isShareLinkEvent(row.metadata_json)));
  const outsiders = await findOutsiders(env, owner, [...new Set([...shareLinkRows].map((row) => row.actor_user_id as string))]);
  return (row) => shareLinkRows.has(row) && outsiders.has(row.actor_user_id as string);
}

async function findOutsiders(env: Env, owner: RunOwnerScope, actors: string[]): Promise<Set<string>> {
  if (actors.length === 0) return new Set();
  if (!owner.teamId) return new Set(actors.filter((actor) => actor !== owner.userId));

  const { team_members } = schema;
  const members = await createDb(env)
    .select({ user_id: team_members.user_id })
    .from(team_members)
    .where(and(eq(team_members.team_id, owner.teamId), inArray(team_members.user_id, actors), eq(team_members.status, 'active')))
    .limit(actors.length);
  const memberIds = new Set(members.map((row) => row.user_id));
  return new Set(actors.filter((actor) => !memberIds.has(actor)));
}
