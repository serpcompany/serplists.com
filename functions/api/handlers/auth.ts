import { Env } from '../types';
import { eq, inArray } from 'drizzle-orm';
import { createDb, schema } from '../db';
import { json, jsonError } from '../utils/response';

/**
 * Usernames are stored lowercased (Better Auth's username plugin), but a typed
 * or shared /profile/JohnDoe URL keeps its casing. Look up both the value as
 * given (usernames saved before the plugin may be mixed case) and its lowercase
 * form, preferring an exact match. An IN list keeps both lookups on
 * idx_users_username; lower(username) or COLLATE NOCASE would scan the table.
 */
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
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return jsonError('User not found', 404);
  }

  return json(user);
}
