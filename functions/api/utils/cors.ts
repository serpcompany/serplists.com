import type { Env } from '../types';

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function parseAllowedOrigins(env: Env): Set<string> {
  const allowed = new Set<string>();

  if (env.FRONTEND_URL) {
    const origin = normalizeOrigin(env.FRONTEND_URL);
    if (origin) allowed.add(origin);
  }

  if (env.CORS_ALLOWED_ORIGINS) {
    for (const raw of env.CORS_ALLOWED_ORIGINS.split(",")) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const origin = normalizeOrigin(trimmed);
      if (origin) allowed.add(origin);
    }
  }

  return allowed;
}

export function resolveCorsOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  const allowed = parseAllowedOrigins(env);

  if (allowed.size === 0) return '*';
  if (!origin) return '*';

  return allowed.has(origin) ? origin : null;
}

export function applyCorsHeaders(response: Response, request: Request, env: Env): Response {
  const origin = resolveCorsOrigin(request, env);
  if (!origin) return response;

  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Expose-Headers', 'X-Request-Id');

  if (origin !== '*') {
    response.headers.append('Vary', 'Origin');
  }

  return response;
}

export function buildCorsPreflightResponse(request: Request, env: Env): Response {
  const origin = resolveCorsOrigin(request, env);
  if (!origin && request.headers.get('Origin')) {
    return new Response(null, { status: 403 });
  }

  const response = new Response(null, { status: 200 });
  return applyCorsHeaders(response, request, env);
}
