import { Env } from '../types';
import { verifyJWT, generateJWT } from '../utils/jwt';
import bcrypt from 'bcryptjs';

export async function handleRegister(request: Request, env: Env): Promise<Response> {
  const { email, password, name } = await request.json();
  
  // Validate required fields
  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'Email and password are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Check if user exists
  const existingUser = await env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(email).first();
  
  if (existingUser) {
    return new Response(JSON.stringify({ error: 'User already exists' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const userId = crypto.randomUUID();
  const hashedPassword = await bcrypt.hash(password, 10);
  
  await env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(userId, email, hashedPassword, name || email.split('@')[0], new Date().toISOString()).run();
  
  const token = await generateJWT(userId, env.JWT_SECRET);
  
  return new Response(JSON.stringify({ token, user: { id: userId, email, name } }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const { email, password } = await request.json();
  
  const user = await env.DB.prepare(
    'SELECT id, email, password_hash, name FROM users WHERE email = ?'
  ).bind(email).first();
  
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
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
    const user = await env.DB.prepare(
      'SELECT id, email, name, username, avatar_url FROM users WHERE id = ?'
    ).bind(userId).first();
    
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
    
    // Build dynamic update query
    const updates = [];
    const values = [];
    
    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (avatar_url !== undefined) {
      updates.push('avatar_url = ?');
      values.push(avatar_url);
    }
    if (username !== undefined) {
      updates.push('username = ?');
      values.push(username);
    }
    
    if (updates.length === 0) {
      return new Response(JSON.stringify({ error: 'No fields to update' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(userId);
    
    await env.DB.prepare(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();
    
    const updatedUser = await env.DB.prepare(
      'SELECT id, email, name, username, avatar_url FROM users WHERE id = ?'
    ).bind(userId).first();
    
    return new Response(JSON.stringify(updatedUser), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response('Method Not Allowed', { status: 405 });
}

export async function handleProfileByUsername(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const username = url.searchParams.get('username');
  
  if (!username) {
    return new Response(JSON.stringify({ error: 'Username required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const user = await env.DB.prepare(
    'SELECT id, name as full_name, username, avatar_url, created_at FROM users WHERE username = ?'
  ).bind(username).first();
  
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

  if (!userId) {
    return new Response(JSON.stringify({ error: 'userId required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const user = await env.DB.prepare(
    'SELECT id, name as full_name, username, avatar_url, created_at FROM users WHERE id = ?'
  ).bind(userId).first();

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
