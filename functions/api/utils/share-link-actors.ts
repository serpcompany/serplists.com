import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { createDb, schema } from '../db';
import type { Env } from '../types';

export type RunOwnerScope = { userId: string | null; teamId: string | null };

type AuditActorRow = { actor_user_id: string | null; metadata_json: string | null };

export const HIDDEN_ACTOR = { userId: null, email: null, name: null, username: null } as const;

const shareLinkMetadataSchema = z.object({ source: z.literal('public_share') });

function isShareLinkEvent(metadataJson: string | null): boolean {
  if (!metadataJson) return false;
  try {
    const metadata: unknown = JSON.parse(metadataJson);
    return shareLinkMetadataSchema.safeParse(metadata).success;
  } catch {
    return false;
  }
}

type ShareLinkActorRow = AuditActorRow & { actor_user_id: string };

const isShareLinkActorRow = (row: AuditActorRow): row is ShareLinkActorRow =>
  Boolean(row.actor_user_id) && isShareLinkEvent(row.metadata_json);

export async function findHiddenShareLinkActors(
  env: Env,
  owner: RunOwnerScope,
  rows: AuditActorRow[],
): Promise<(row: AuditActorRow) => boolean> {
  const shareLinkRows = rows.filter(isShareLinkActorRow);
  const outsiders = await findOutsiders(env, owner, [...new Set(shareLinkRows.map((row) => row.actor_user_id))]);
  const hiddenRows = new Set<AuditActorRow>(shareLinkRows.filter((row) => outsiders.has(row.actor_user_id)));
  return (row) => hiddenRows.has(row);
}

async function findOutsiders(env: Env, owner: RunOwnerScope, actors: string[]): Promise<Set<string>> {
  if (actors.length === 0) return new Set();
  if (!owner.teamId) return new Set(actors.filter((actor) => actor !== owner.userId));

  const { teamMembers } = schema;
  const members = await createDb(env)
    .select({ user_id: teamMembers.user_id })
    .from(teamMembers)
    .where(and(eq(teamMembers.team_id, owner.teamId), inArray(teamMembers.user_id, actors), eq(teamMembers.status, 'active')))
    .limit(actors.length);
  const memberIds = new Set(members.map((row) => row.user_id));
  return new Set(actors.filter((actor) => !memberIds.has(actor)));
}
