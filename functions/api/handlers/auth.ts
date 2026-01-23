import { Env } from '../types';
import { verifyJWT, generateJWT } from '../utils/jwt';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { createDb, schema } from '../db';
import { json, jsonError } from '../utils/response';

export async function handleRegister(request: Request, env: Env): Promise<Response> {
  const { email, password, name } = await request.json();
  const db = createDb(env);
  const { users } = schema;

  // Validate required fields
  if (!email || !password) {
    return jsonError('Email and password are required', 400);
  }

  // Check if user exists
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser) {
    return jsonError('User already exists', 400);
  }

  const userId = crypto.randomUUID();
  const hashedPassword = await bcrypt.hash(password, 10);

  await db.insert(users).values({
    id: userId,
    email,
    password_hash: hashedPassword,
    name: name || email.split('@')[0],
    created_at: new Date().toISOString()
  });

  const token = await generateJWT(userId, env.JWT_SECRET);

  return json({ token, user: { id: userId, email, name } });
}

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const { email, password } = await request.json();
  const db = createDb(env);
  const { users } = schema;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
    return jsonError('Invalid credentials', 401);
  }

  const token = await generateJWT(user.id, env.JWT_SECRET);

  return json({
    token,
    user: { id: user.id, email: user.email, name: user.name }
  });
}

export async function handleProfile(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  const db = createDb(env);
  const { users } = schema;

  if (!authHeader) {
    return jsonError('Unauthorized', 401);
  }

  const userId = await verifyJWT(authHeader.replace('Bearer ', ''), env.JWT_SECRET);

  if (!userId) {
    return jsonError('Invalid token', 401);
  }

  if (request.method === 'GET') {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        username: users.username,
        avatar_url: users.avatar_url
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return jsonError('User not found', 404);
    }

    return json(user);
  }

  if (request.method === 'PUT') {
    const { name, avatar_url, username } = await request.json();

    const updates: Record<string, unknown> = {};

    if (name !== undefined) {
      updates.name = name;
    }
    if (avatar_url !== undefined) {
      updates.avatar_url = avatar_url;
    }
    if (username !== undefined) {
      updates.username = username;
    }

    if (Object.keys(updates).length === 0) {
      return jsonError('No fields to update', 400);
    }

    updates.updated_at = new Date().toISOString();

    await db.update(users).set(updates).where(eq(users.id, userId));

    const [updatedUser] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        username: users.username,
        avatar_url: users.avatar_url
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return json(updatedUser);
  }

  return new Response('Method Not Allowed', { status: 405 });
}

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
