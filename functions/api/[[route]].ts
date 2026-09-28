import { Env } from './types';
import { getApiEnv } from './env';
import { applyCorsHeaders, buildCorsPreflightResponse } from './utils/cors';
import { getClientIp, log } from './utils/logger';
import { sanitizeLogPath } from './utils/log-path';
import { checkAuthRateLimit } from './utils/auth-rate-limit';
import { checkRouteRateLimit, routeRateLimitResponse } from './utils/route-rate-limit';
import { createBetterAuth } from './better-auth';
import { getAuthEmailPolicy, isProductionAuthPolicy } from './utils/auth-policy';
import { findOversizedBody } from './utils/body-limit';
import { rejectUnsafeAuthRequest } from './utils/auth-request-guard';
import { TEST_ACCOUNTS_DISABLED_MESSAGE, blockedTestEmailDomain } from './utils/test-email-block';
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
import { handleTeams } from './handlers/teams';
import { handleGenerateTemplateFromClipy } from './handlers/clipy';
import { handleAgentKeys } from './handlers/agent-keys';
import { handleAgentMcp } from './handlers/agentMcp';
import { jsonError } from './utils/response';
import { isPersonalRunMcpEnabled, isPersonalRunMcpPath } from './utils/personal-run-mcp-feature';

function isLocalRequest(url: URL): boolean {
  return (
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.port === '8788'
  );
}

function requiresConfiguredAuthEmail(path: string, emailVerificationRequired: boolean): boolean {
  if (path === 'auth/sign-up/email') {
    // Sign-up creates the account before it sends the verification email, so
    // refuse it up front when that email cannot be sent.
    return emailVerificationRequired;
  }

  return (
    path === 'auth/request-password-reset' ||
    path === 'auth/send-verification-email'
  );
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
  const { env } = context;
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(context.request.headers);
  requestHeaders.set('X-Request-Id', requestId);
  const request = new Request(context.request, { headers: requestHeaders });
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/', '');
  // Some paths carry a secret token: log this copy, route on the raw path.
  const logPath = sanitizeLogPath(path);
  const startMs = Date.now();
  // Only for the in-memory rate limits: a client IP is personal data, never logged.
  const ip = getClientIp(request);

  const finalize = (resp: Response) => {
    resp.headers.set('X-Request-Id', requestId);
    applyCorsHeaders(resp, request, env);
    log('info', 'api_request', {
      requestId,
      method: request.method,
      path: logPath,
      status: resp.status,
      durationMs: Date.now() - startMs,
    });
    return resp;
  };
  
  let response: Response;
  
  try {
    if (isPersonalRunMcpPath(path) && !isPersonalRunMcpEnabled(env, url)) {
      response = jsonError('Not found', 404);
      return finalize(response);
    }

    try {
      getApiEnv(env);
    } catch (error) {
      log('error', 'env_validation_error', {
        requestId,
        path: logPath,
        error: error instanceof Error ? error.message : String(error),
      });
      response = jsonError('Server configuration error', 500);
      return finalize(response);
    }

    const oversizedLabel = await findOversizedBody(request, path);
    if (oversizedLabel) {
      response = jsonError(`Payload too large (max ${oversizedLabel})`, 413);
      return finalize(response);
    }

    if (ip) {
      const limitParams = { method: request.method, path, ip, isLocal: isLocalRequest(url) };
      const authLimit = checkAuthRateLimit(limitParams);
      const routeLimit = authLimit ? null : checkRouteRateLimit(limitParams);
      const limit = authLimit ?? routeLimit?.result;
      if (limit && !limit.allowed) {
        if (routeLimit) {
          response = routeRateLimitResponse(routeLimit.bucket, limit.retryAfterSeconds);
        } else {
          response = jsonError('Too many requests', 429);
          response.headers.set('Retry-After', String(limit.retryAfterSeconds));
        }
        return finalize(response);
      }
    }

    if (path.startsWith('auth')) {
      const rejection = rejectUnsafeAuthRequest(request, env);
      if (rejection) return finalize(rejection);
    }

    // Handle specific auth routes
    if (path === 'health') {
      response = new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else if (path === 'auth/status' && request.method === 'GET') {
      response = new Response(
        JSON.stringify(getAuthEmailPolicy(env)),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } else if (path.startsWith('auth') && request.method === 'POST') {
      // From wrangler.toml, never the hostname: staging.serplists.com is a preview.
      if (
        isProductionAuthPolicy(env) &&
        (path === 'auth/register' ||
          path === 'auth/login' ||
          path === 'auth/sign-up/email' ||
          path === 'auth/sign-in/email')
      ) {
        // A fast first check; Better Auth's database hooks enforce the same
        // block for every sign-up and sign-in path (see better-auth.ts).
        let body: unknown;
        try {
          body = await request.clone().json();
        } catch {
          return finalize(jsonError('Invalid JSON', 400));
        }
        const email =
          typeof body === 'object' && body !== null && 'email' in body && typeof body.email === 'string'
            ? body.email
            : '';
        const blockedDomain = email ? blockedTestEmailDomain(email) : null;
        if (blockedDomain) {
          log('warn', 'blocked_test_user_auth', { domain: blockedDomain, path: logPath });
          response = jsonError(TEST_ACCOUNTS_DISABLED_MESSAGE, 403);
          return finalize(response);
        }
      }

      const emailPolicy = getAuthEmailPolicy(env);
      if (
        requiresConfiguredAuthEmail(path, emailPolicy.emailVerificationRequired) &&
        !emailPolicy.emailAuthAvailable
      ) {
        response = jsonError('Auth email is temporarily unavailable. Please contact support.', 503, {
          code: 'auth_email_unavailable',
        });
        return finalize(response);
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
    } else if (path === 'templates/generate-from-clipy') {
      response = await handleGenerateTemplateFromClipy(request, env);
    } else if (path === 'agent-keys' || path.startsWith('agent-keys/')) {
      response = await handleAgentKeys(request, env);
    } else if (path === 'mcp') {
      response = await handleAgentMcp(request, env);
    } else if (path.startsWith('templates')) {
      response = await handleTemplates(request, env);
    } else if (path.startsWith('checklists')) {
      response = await handleChecklists(request, env);
    } else if (path.startsWith('teams')) {
      response = await handleTeams(request, env);
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
        path: logPath,
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
