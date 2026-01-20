import { Env } from '../types';
import { verifyJWT, generateJWT } from '../utils/jwt';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { createDb, schema } from '../db';

export async function handleRegister(request: Request, env: Env): Promise<Response> {
  const { email, password, name } = await request.json();
  const db = createDb(env);
  const { users } = schema;

  // Validate required fields
  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'Email and password are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Check if user exists
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser) {
    return new Response(JSON.stringify({ error: 'User already exists' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
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

  return new Response(JSON.stringify({ token, user: { id: userId, email, name } }), {
    headers: { 'Content-Type': 'application/json' }
  });
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
    return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const token = await generateJWT(user.id, env.JWT_SECRET);

  return new Response(JSON.stringify({
    token,
    user: { id: user.id, email: user.email, name: user.name }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleProfile(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  const db = createDb(env);
  const { users } = schema;

  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const userId = await verifyJWT(authHeader.replace('Bearer ', ''), env.JWT_SECRET);

  if (!userId) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
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
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(user), {
      headers: { 'Content-Type': 'application/json' }
    });
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
      return new Response(JSON.stringify({ error: 'No fields to update' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
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

    return new Response(JSON.stringify(updatedUser), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response('Method Not Allowed', { status: 405 });
}

export async function handleProfileByUsername(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const username = url.searchParams.get('username');
  const db = createDb(env);
  const { users } = schema;

  if (!username) {
    return new Response(JSON.stringify({ error: 'Username required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
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
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify(user), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleProfileById(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const db = createDb(env);
  const { users } = schema;

  if (!userId) {
    return new Response(JSON.stringify({ error: 'userId required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
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
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify(user), {
    headers: { 'Content-Type': 'application/json' }
  });
}
