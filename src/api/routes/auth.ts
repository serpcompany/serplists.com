import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { Env } from '../worker';
import { hashPassword, verifyPassword } from '../utils/crypto';
import { generateId } from '../utils/id';

export const authRoutes = new Hono<{ Bindings: Env }>();

// Register
authRoutes.post('/register', async (c) => {
  const { email, password, name } = await c.req.json();
  
  if (!email || !password) {
    return c.json({ error: 'Email and password required' }, 400);
  }

  const db = c.env.DB;
  
  // Check if user exists
  const existing = await db.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(email).first();
  
  if (existing) {
    return c.json({ error: 'User already exists' }, 409);
  }
  
  // Create user
  const userId = generateId();
  const passwordHash = await hashPassword(password);
  
  await db.prepare(
    'INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)'
  ).bind(userId, email, passwordHash, name || null).run();
  
  // Create session
  const token = await sign(
    { 
      sub: userId, 
      email,
      exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
    },
    c.env.JWT_SECRET
  );
  
  return c.json({ 
    token,
    user: { id: userId, email, name }
  });
});

// Login
authRoutes.post('/login', async (c) => {
  const { email, password } = await c.req.json();
  
  if (!email || !password) {
    return c.json({ error: 'Email and password required' }, 400);
  }

  const db = c.env.DB;
  
  // Get user
  const user = await db.prepare(
    'SELECT id, email, password_hash, name, avatar_url FROM users WHERE email = ?'
  ).bind(email).first();
  
  if (!user || !await verifyPassword(password, user.password_hash as string)) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  
  // Create token
  const token = await sign(
    { 
      sub: user.id, 
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
    },
    c.env.JWT_SECRET
  );
  
  return c.json({ 
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url
    }
  });
});

// Get current user
authRoutes.get('/profile', async (c) => {
  const payload = c.get('jwtPayload');
  if (!payload) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  const db = c.env.DB;
  const user = await db.prepare(
    'SELECT id, email, name, avatar_url, role FROM users WHERE id = ?'
  ).bind(payload.sub).first();
  
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }
  
  return c.json({ user });
});