import { Env } from '../types';
import { eq } from 'drizzle-orm';
import { createDb, schema } from '../db';
import { json, jsonError } from '../utils/response';

export async function handleProfileByUsername(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const username = url.searchParams.get('username');
  const db = createDb(env);
  const { users } = schema;

  if (!username) {
    return jsonError('Username required', 400);
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
    .where(eq(users.username, username))
    .limit(1);

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
