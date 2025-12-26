import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';
import { authRoutes } from './routes/auth';
import { templatesRoutes } from './routes/templates';
import { checklistsRoutes } from './routes/checklists';
import { usersRoutes } from './routes/users';

export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  JWT_SECRET: string;
  FRONTEND_URL: string;
}

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use('*', async (c, next) => {
  const corsMiddleware = cors({
    origin: c.env.FRONTEND_URL,
    credentials: true,
  });
  return corsMiddleware(c, next);
});

// Public routes
app.route('/api/auth', authRoutes);

// Protected routes
app.use('/api/*', async (c, next) => {
  // Skip JWT for public endpoints
  const publicPaths = ['/api/templates/public', '/api/auth'];
  if (publicPaths.some((path: string) => c.req.path.startsWith(path))) {
    return next();
  }
  
  const jwtMiddleware = jwt({
    secret: c.env.JWT_SECRET,
  });
  return jwtMiddleware(c, next);
});

app.route('/api/templates', templatesRoutes);
app.route('/api/checklists', checklistsRoutes);
app.route('/api/users', usersRoutes);

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;