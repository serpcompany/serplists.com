import { Env } from '../types';
import { and, eq, isNotNull } from 'drizzle-orm';
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

// Resolves only users with a public username, the same profiles by-username serves. An id
// taken from a public response (a template's creator, say) must not turn into the name and
// avatar of someone who never made a public profile. Unknown ids get the same 404.
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
