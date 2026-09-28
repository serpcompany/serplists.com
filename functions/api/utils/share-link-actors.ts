import { and, eq, inArray } from 'drizzle-orm';
import { createDb, schema } from '../db';
import type { Env } from '../types';

// Share-link visitors are guests. An edit through a share link names its actor only when
// the signed-in visitor already belongs to the run's owner context (the Personal owner, or an
// active member of its Organization); anyone else is recorded as no one, so posting a link
// cannot be used to collect the names and emails of people who use it. Rows written before
// that rule may name outsiders, so history reads hide those actors too.

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
 * Actors of share-link events in `rows` who are outside `owner`'s context. Costs one indexed
 * membership read for an Organization, and none when no share-link event names anyone.
 */
export async function findShareLinkOutsiders(env: Env, owner: RunOwnerScope, rows: AuditActorRow[]): Promise<Set<string>> {
  const actors = [...new Set(rows
    .filter((row) => row.actor_user_id && isShareLinkEvent(row.metadata_json))
    .map((row) => row.actor_user_id as string))];
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
