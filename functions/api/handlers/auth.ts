import { Env } from '../types';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { createDb, schema } from '../db';
import { findPublicProfileOwner } from '../utils/public-profile-owner';
import { json, jsonError } from '../utils/response';

export async function handleProfileByHandle(request: Request, env: Env): Promise<Response> {
  const handle = new URL(request.url).searchParams.get('handle')?.trim();
  if (!handle) {
    return jsonError('Handle required', 400);
  }

  const owner = await findPublicProfileOwner(env, handle);
  return owner ? json(owner.profile) : jsonError('Profile not found', 404);
}

export async function handleProfileByUsername(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const username = url.searchParams.get('username')?.trim();
  const db = createDb(env);
  const { users } = schema;

  if (!username) {
    return jsonError('Username required', 400);
  }

  const candidates = Array.from(new Set([username, username.toLowerCase()]));
  const matches = await db
    .select({
      id: users.id,
      full_name: users.name,
      username: users.username,
      avatar_url: users.avatar_url,
      created_at: users.created_at
    })
    .from(users)
    .where(inArray(users.username, candidates))
    .limit(candidates.length);
  const user = matches.find((match) => match.username === username) ?? matches[0];

  if (!user) {
    return jsonError('User not found', 404);
  }

  return json(user);
}

export async function handleProfileById(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const db = createDb(env);
  const { users } = schema;

  if (!userId) {
    return jsonError('userId required', 400);
  }

  const [user] = await db
    .select({
      id: users.id,
      full_name: users.name,
      username: users.username,
      avatar_url: users.avatar_url,
      created_at: users.created_at
    })
    .from(users)
    .where(and(eq(users.id, userId), isNotNull(users.username)))
    .limit(1);

  if (!user) {
    return jsonError('User not found', 404);
  }

  return json(user);
}
