import { Env } from './types';
import { getApiEnv } from './env';
import { applyCorsHeaders, buildCorsPreflightResponse } from './utils/cors';
import { getClientIp, log } from './utils/logger';
import { sanitizeLogPath } from './utils/log-path';
import { checkAuthRateLimit } from './utils/auth-rate-limit';
import { checkRouteRateLimit, routeRateLimitResponse } from './utils/route-rate-limit';
import { createBetterAuth } from './better-auth';
import { getAuthEmailPolicy, isProductionAuthPolicy } from './utils/auth-policy';
import { checkRequestBodyLimit } from './utils/body-limit';
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
import { authJsonError, jsonError } from './utils/response';
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

// Pages matches a verb export (onRequestGet, ...) on the exact method only and
// sends any other method, HEAD included, to the static assets, whose SPA fallback
// answers 200 with index.html. One catch-all keeps every /api/* method on the API.
export const onRequest = dispatch;

// Default export for module workers (required for tests). It shares the Pages
// dispatcher, so tests exercise the routing production uses.
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return dispatch({ request, env });
  }
};

function dispatch(context: { request: Request; env: Env }): Promise<Response> {
  if (context.request.method === 'OPTIONS') {
    return handleCORS(context);
  }
  return handleRequest(context);
}

async function handleCORS(context: { request: Request; env: Env }): Promise<Response> {
  return buildCorsPreflightResponse(context.request, context.env);
}

async function handleRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { env } = context;
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(context.request.headers);
  requestHeaders.set('X-Request-Id', requestId);
  // A client can send X-Forwarded-Host; nothing may build URLs from it (Better
  // Auth's baseURL is pinned in better-auth.ts). X-Forwarded-For stays for
  // getClientIp in local dev.
  requestHeaders.delete('X-Forwarded-Host');
  const request = new Request(context.request, { headers: requestHeaders });
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/', '');
  // Some paths carry a secret token: log this copy, route on the raw path.
  const logPath = sanitizeLogPath(path);
  const startMs = Date.now();
  // Only for the in-memory rate limits: a client IP is personal data, never logged.
  const ip = getClientIp(request);
  // Better Auth's client shows `message`, so auth errors the router sends itself carry one.
  const isAuthPath = path.startsWith('auth');
  const errorResponse = (message: string, status: number) =>
    isAuthPath ? authJsonError(message, status) : jsonError(message, status);

  const finalize = (handlerResponse: Response) => {
    // HEAD gets the status and headers without a body, whatever the handler built.
    const resp =
      request.method === 'HEAD' && handlerResponse.body ? new Response(null, handlerResponse) : handlerResponse;
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
      response = errorResponse('Server configuration error', 500);
      return finalize(response);
    }

    const bodyRejection = await checkRequestBodyLimit(request, path);
    if (bodyRejection) {
      response = errorResponse(bodyRejection.error, bodyRejection.status);
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
          response = authJsonError('Too many requests. Please try again later.', 429, {
            code: 'rate_limited',
            retryAfterSeconds: limit.retryAfterSeconds,
          });
        }
        return finalize(response);
      }
    }

    if (isAuthPath) {
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
          return finalize(authJsonError('Invalid JSON', 400));
        }
        const email =
          typeof body === 'object' && body !== null && 'email' in body && typeof body.email === 'string'
            ? body.email
            : '';
        const blockedDomain = email ? blockedTestEmailDomain(email) : null;
        if (blockedDomain) {
          log('warn', 'blocked_test_user_auth', { domain: blockedDomain, path: logPath });
          response = authJsonError(TEST_ACCOUNTS_DISABLED_MESSAGE, 403, { code: 'test_account_blocked' });
          return finalize(response);
        }
      }

      const emailPolicy = getAuthEmailPolicy(env);
      if (
        requiresConfiguredAuthEmail(path, emailPolicy.emailVerificationRequired) &&
        !emailPolicy.emailAuthAvailable
      ) {
        response = authJsonError('Auth email is temporarily unavailable. Please contact support.', 503, {
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
      response = errorResponse('Invalid JSON', 400);
    } else {
      log('error', 'api_error', {
        requestId,
        method: request.method,
        path: logPath,
        error: error instanceof Error ? error.message : String(error),
      });
      response = errorResponse('Internal Server Error', 500);
    }
  }

  return finalize(response);
}
