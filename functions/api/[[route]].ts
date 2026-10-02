import { Env } from './types';
import { getApiEnv } from './env';
import { applyCorsHeaders, buildCorsPreflightResponse } from './utils/cors';
import { describeErrorForLog, getClientIp, log } from './utils/logger';
import { sanitizeLogPath } from './utils/log-path';
import { runWithRequestId } from './utils/request-context';
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
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}

const TEST_EMAIL_CHECKED_AUTH_PATHS = new Set([
  'auth/register',
  'auth/login',
  'auth/sign-up/email',
  'auth/sign-in/email',
]);

function requiresConfiguredAuthEmail(path: string, emailVerificationRequired: boolean): boolean {
  const signUpSendsVerificationEmail = path === 'auth/sign-up/email' && emailVerificationRequired;
  return (
    signUpSendsVerificationEmail ||
    path === 'auth/request-password-reset' ||
    path === 'auth/send-verification-email'
  );
}

async function blockedTestEmailResponse(request: Request, logPath: string): Promise<Response | null> {
  let body: unknown;
  try {
    body = await request.clone().json();
  } catch {
    return authJsonError('Invalid JSON', 400);
  }
  const email =
    typeof body === 'object' && body !== null && 'email' in body && typeof body.email === 'string'
      ? body.email
      : '';
  const blockedDomain = email ? blockedTestEmailDomain(email) : null;
  if (!blockedDomain) return null;
  log('warn', 'blocked_test_user_auth', { domain: blockedDomain, path: logPath });
  return authJsonError(TEST_ACCOUNTS_DISABLED_MESSAGE, 403, { code: 'test_account_blocked' });
}

async function handleAuthPost(request: Request, env: Env, path: string, logPath: string): Promise<Response> {
  if (isProductionAuthPolicy(env) && TEST_EMAIL_CHECKED_AUTH_PATHS.has(path)) {
    const blocked = await blockedTestEmailResponse(request, logPath);
    if (blocked) return blocked;
  }

  const emailPolicy = getAuthEmailPolicy(env);
  if (
    requiresConfiguredAuthEmail(path, emailPolicy.emailVerificationRequired) &&
    !emailPolicy.emailAuthAvailable
  ) {
    return authJsonError('Auth email is temporarily unavailable. Please contact support.', 503, {
      code: 'auth_email_unavailable',
    });
  }

  return createBetterAuth(env, request).handler(request);
}

const api = {
  fetch(request: Request, env: Env): Promise<Response> {
    return dispatch({ request, env });
  },
};

export default api;

function dispatch(context: { request: Request; env: Env }): Promise<Response> {
  if (context.request.method === 'OPTIONS') {
    return handleCORS(context);
  }
  return handleRequest(context);
}

async function handleCORS(context: { request: Request; env: Env }): Promise<Response> {
  return buildCorsPreflightResponse(context.request, context.env);
}

function handleRequest(context: { request: Request; env: Env }): Promise<Response> {
  const requestId = crypto.randomUUID();
  return runWithRequestId(requestId, () => respondToRequest(context, requestId));
}

async function respondToRequest(context: { request: Request; env: Env }, requestId: string): Promise<Response> {
  const { env } = context;
  const requestHeaders = new Headers(context.request.headers);
  requestHeaders.set('X-Request-Id', requestId);
  requestHeaders.delete('X-Forwarded-Host');
  let request = new Request(context.request, { headers: requestHeaders });
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/', '');
  const logPath = sanitizeLogPath(path);
  const startMs = Date.now();
  const rateLimitIp = getClientIp(request);
  const isAuthPath = path.startsWith('auth');
  const errorResponse = (message: string, status: number) =>
    isAuthPath ? authJsonError(message, status) : jsonError(message, status);

  const finalize = (handlerResponse: Response) => {
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
        ...describeErrorForLog(error),
      });
      response = errorResponse('Server configuration error', 500);
      return finalize(response);
    }

    const bodyCheck = await checkRequestBodyLimit(request, path);
    if ('rejection' in bodyCheck) {
      response = errorResponse(bodyCheck.rejection.error, bodyCheck.rejection.status);
      return finalize(response);
    }
    request = bodyCheck.request;

    if (rateLimitIp) {
      const limitParams = { method: request.method, path, ip: rateLimitIp, isLocal: isLocalRequest(url) };
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
      response = await handleAuthPost(request, env, path, logPath);
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
        ...describeErrorForLog(error),
      });
      response = errorResponse('Internal Server Error', 500);
    }
  }

  return finalize(response);
}
