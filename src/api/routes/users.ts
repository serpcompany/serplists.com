import { Hono } from 'hono';
import { Env } from '../worker';

export const usersRoutes = new Hono<{ Bindings: Env }>();

// Get user profile
usersRoutes.get('/profile', async (c) => {
  const payload = c.get('jwtPayload');
  const db = c.env.DB;
  
  const user = await db.prepare(
    'SELECT id, email, name, avatar_url, role, created_at FROM users WHERE id = ?'
  ).bind(payload.sub).first();
  
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }
  
  // Get user stats
  const stats = await db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM templates WHERE user_id = ?) as template_count,
      (SELECT COUNT(*) FROM checklist_runs WHERE user_id = ?) as checklist_count,
      (SELECT COUNT(*) FROM checklist_runs WHERE user_id = ? AND status = 'completed') as completed_count
  `).bind(payload.sub, payload.sub, payload.sub).first();
  
  return c.json({ 
    user,
    stats
  });
});

// Update user profile
usersRoutes.patch('/profile', async (c) => {
  const payload = c.get('jwtPayload');
  const body = await c.req.json();
  const db = c.env.DB;
  
  const updates: string[] = [];
  const params: unknown[] = [];
  
  if (body.name !== undefined) {
    updates.push('name = ?');
    params.push(body.name);
  }
  
  if (body.avatar_url !== undefined) {
    updates.push('avatar_url = ?');
    params.push(body.avatar_url);
  }
  
  if (updates.length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }
  
  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(payload.sub);
  
  await db.prepare(
    `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...params).run();
  
  return c.json({ message: 'Profile updated' });
});

// Upload avatar
usersRoutes.post('/avatar', async (c) => {
  const payload = c.get('jwtPayload');
  const formData = await c.req.formData();
  const file = formData.get('avatar') as File;
  
  if (!file) {
    return c.json({ error: 'No file provided' }, 400);
  }
  
  // Validate file type
  if (!file.type.startsWith('image/')) {
    return c.json({ error: 'File must be an image' }, 400);
  }
  
  // Upload to R2
  const key = `avatars/${payload.sub}/${Date.now()}-${file.name}`;
  await c.env.FILES.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type,
    },
  });
  
  // Update user profile
  const avatarUrl = `/files/${key}`;
  await c.env.DB.prepare(
    'UPDATE users SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(avatarUrl, payload.sub).run();
  
  return c.json({ avatar_url: avatarUrl });
});