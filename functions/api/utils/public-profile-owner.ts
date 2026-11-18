import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { createDb, schema } from '../db';
import type { Env } from '../types';
import { normalizePublicHandle } from '../../../src/lib/schemas/publicHandle';
import type { PublicProfileBody } from '../../../src/lib/schemas/publicProfiles';

export type PublicProfileOwner = { type: 'user' | 'team'; id: string; profile: PublicProfileBody };

export async function findPublicProfileOwner(env: Env, handle: string): Promise<PublicProfileOwner | null> {
  const { publicHandles, users, teams } = schema;
  const [row] = await createDb(env)
    .select({
      userId: users.id,
      username: users.username,
      userName: users.name,
      userAvatarUrl: users.avatar_url,
      userCreatedAt: users.created_at,
      team: {
        id: teams.id,
        slug: teams.slug,
        name: teams.name,
        avatarUrl: teams.avatar_url,
        description: teams.description,
        archivedAt: teams.archived_at,
      },
    })
    .from(publicHandles)
    .leftJoin(users, and(eq(publicHandles.owner_type, 'user'), eq(users.id, publicHandles.owner_id)))
    .leftJoin(teams, and(eq(publicHandles.owner_type, 'team'), eq(teams.id, publicHandles.owner_id)))
    .where(eq(publicHandles.handle, normalizePublicHandle(handle)))
    .limit(1);
  if (!row) return null;

  if (row.userId && row.username) {
    return {
      type: 'user',
      id: row.userId,
      profile: {
        type: 'user',
        id: row.userId,
        username: row.username,
        full_name: row.userName,
        avatar_url: row.userAvatarUrl,
        created_at: row.userCreatedAt,
      },
    };
  }

  const { team } = row;
  const teamHandle = team?.slug?.trim();
  if (team?.id && teamHandle && !team.archivedAt) {
    return {
      type: 'team',
      id: team.id,
      profile: {
        type: 'team',
        handle: teamHandle,
        name: team.name,
        avatar_url: team.avatarUrl,
        description: team.description,
      },
    };
  }

  return null;
}

export function publicTemplatesOfProfileOwners(ownerType: PublicProfileOwner['type'], ownerIds: string[]): SQL | undefined {
  const { templates } = schema;
  const isPublicWithoutItsIndex = sql`+${templates.is_public} = 1`;
  const ownedByTheProfileOwners =
    ownerType === 'user'
      ? and(eq(templates.owner_type, 'user'), inArray(templates.user_id, ownerIds), isNull(templates.team_id))
      : and(sql`+${templates.owner_type} = 'team'`, inArray(templates.team_id, ownerIds));
  return and(ownedByTheProfileOwners, isPublicWithoutItsIndex, isNull(templates.deleted_at));
}
