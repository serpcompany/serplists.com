import { Env } from './types';
import { getApiEnv } from './env';
import { applyCorsHeaders, buildCorsPreflightResponse } from './utils/cors';
import { getClientIp, log } from './utils/logger';
import { checkRateLimit } from './utils/rate-limit';
import { createBetterAuth } from './better-auth';
import { isBodyWithinLimit } from './utils/body';
import { 
  handleProfileByUsername, 
  handleProfileById
} from './handlers/auth';
import { handleTemplates } from './handlers/templates';
import { handleChecklists } from './handlers/checklists';
import { handleUploads } from './handlers/uploads';
import { handleStripe } from './handlers/stripe';
import { handleBilling } from './handlers/billing';
import { handleAdmin } from './handlers/admin';
import { jsonError } from './utils/response';

const blockedTestEmailDomains = new Set(['serplists.dev', 'serp-checklists.dev']);

function isProductionHost(hostname: string): boolean {
  return hostname === 'serplists.com' || hostname.endsWith('.serplists.com');
}

function isLocalRequest(url: URL): boolean {
  return (
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.port === '8788'
  );
}

function isBlockedTestEmail(email: string): boolean {
  const lower = email.trim().toLowerCase();
  const atIndex = lower.lastIndexOf('@');
  if (atIndex < 0) return false;
  const domain = lower.slice(atIndex + 1);
  return blockedTestEmailDomains.has(domain);
}

export const onRequestGet = handleRequest;
export const onRequestPost = handleRequest;
export const onRequestPut = handleRequest;
export const onRequestDelete = handleRequest;
export const onRequestOptions = handleCORS;

// Default export for module workers (required for tests)
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return handleCORS({ request, env });
    }
    return handleRequest({ request, env });
  }
};

async function handleCORS(context: { request: Request; env: Env }): Promise<Response> {
  return buildCorsPreflightResponse(context.request, context.env);
}

async function handleRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/', '');
  const requestId = crypto.randomUUID();
  const startMs = Date.now();
  const ip = getClientIp(request);

  const finalize = (resp: Response) => {
    resp.headers.set('X-Request-Id', requestId);
    applyCorsHeaders(resp, request, env);
    log('info', 'api_request', {
      requestId,
      method: request.method,
      path,
      status: resp.status,
      durationMs: Date.now() - startMs,
      ip: ip ?? undefined,
    });
    return resp;
  };
  
  let response: Response;
  
  try {
    try {
      getApiEnv(env);
    } catch (error) {
      log('error', 'env_validation_error', {
        requestId,
        path,
        message: error instanceof Error ? error.message : String(error),
      });
      response = jsonError('Server configuration error', 500);
      return finalize(response);
    }

    if (
      (request.method === 'POST' || request.method === 'PUT') &&
      request.headers.get('Content-Type')?.includes('application/json')
    ) {
      const maxBytes = path.startsWith('templates/backup') ? 2 * 1024 * 1024 : 1024 * 1024;
      const maxLabel = path.startsWith('templates/backup') ? '2MB' : '1MB';
      const contentLength = request.headers.get('Content-Length');
      if (contentLength) {
        const bytes = Number.parseInt(contentLength, 10);
        if (Number.isFinite(bytes) && bytes > maxBytes) {
          response = jsonError(`Payload too large (max ${maxLabel})`, 413);
          return finalize(response);
        }
      } else {
        const ok = await isBodyWithinLimit(request.clone(), maxBytes);
        if (!ok) {
          response = jsonError(`Payload too large (max ${maxLabel})`, 413);
          return finalize(response);
        }
      }
    }

    if (ip) {
      const isAuth = path.startsWith('auth/');
      const isSensitiveWrite =
        (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE') &&
        (path.startsWith('templates') || path.startsWith('checklists') || path.startsWith('uploads'));

      if (isAuth) {
        const limit = isLocalRequest(url)
          ? checkRateLimit(`auth:${ip}`, { windowMs: 60 * 60 * 1000, max: 300 })
          : checkRateLimit(`auth:${ip}`, { windowMs: 5 * 60 * 1000, max: 30 });
        if (!limit.allowed) {
          response = jsonError('Too many requests', 429);
          response.headers.set('Retry-After', String(limit.retryAfterSeconds));
          return finalize(response);
        }
      } else if (isSensitiveWrite) {
        const limit = checkRateLimit(`write:${ip}`, { windowMs: 60 * 1000, max: 120 });
        if (!limit.allowed) {
          response = jsonError('Too many requests', 429);
          response.headers.set('Retry-After', String(limit.retryAfterSeconds));
          return finalize(response);
        }
      }
    }

    // Handle specific auth routes
    if (path === 'health') {
      response = new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else if (path.startsWith('auth') && request.method === 'POST') {
      let isProdRequest = isProductionHost(url.hostname);
      if (!isProdRequest && env.FRONTEND_URL) {
        try {
          isProdRequest = isProductionHost(new URL(env.FRONTEND_URL).hostname);
        } catch {
          // Ignore malformed FRONTEND_URL.
        }
      }

      if (
        isProdRequest &&
        (path === 'auth/register' ||
          path === 'auth/login' ||
          path === 'auth/sign-up/email' ||
          path === 'auth/sign-in/email')
      ) {
        try {
          const body = await request.clone().json();
          const email = typeof body?.email === 'string' ? body.email : '';
          if (email && isBlockedTestEmail(email)) {
            log('warn', 'blocked_test_user_auth', { email, path });
            response = jsonError('Test accounts are disabled in production', 403);
            return finalize(response);
          }
        } catch {
          // Ignore parse errors; auth handler will validate payloads.
        }
      }

      const auth = createBetterAuth(env, request);
      response = await auth.handler(request);
    } else if (path.startsWith('auth')) {
      const auth = createBetterAuth(env, request);
      response = await auth.handler(request);
    } else if (path === 'profiles/by-username') {
      response = await handleProfileByUsername(request, env);
    } else if (path === 'profiles/by-id') {
      response = await handleProfileById(request, env);
    } else if (path.startsWith('templates')) {
      response = await handleTemplates(request, env);
    } else if (path.startsWith('checklists')) {
      response = await handleChecklists(request, env);
    } else if (path.startsWith('uploads')) {
      response = await handleUploads(request, env);
    } else if (path.startsWith('stripe')) {
      response = await handleStripe(request, env);
    } else if (path.startsWith('billing')) {
      response = await handleBilling(request, env);
    } else if (path.startsWith('admin')) {
      response = await handleAdmin(request, env);
    } else {
      response = new Response('Not Found', { status: 404 });
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      response = new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      log('error', 'api_error', {
        requestId,
        method: request.method,
        path,
        ip: ip ?? undefined,
        error: error instanceof Error ? error.message : String(error),
      });
      response = new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  return finalize(response);
}
