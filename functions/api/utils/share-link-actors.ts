import { and, eq, inArray } from 'drizzle-orm';
import { createDb, schema } from '../db';
import type { Env } from '../types';

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
