import { z } from 'zod';

export type AuthErrorCode = 'EMAIL_NOT_VERIFIED' | 'UNKNOWN';

export interface AuthActionResult {
  ok: boolean;
  error?: string;
  errorCode?: AuthErrorCode;
}

type AuthClientError = { status?: number; code?: string; message?: string } | null | undefined;
// Better Auth client calls resolve a failed request (non-2xx, or status 0 when the network
// failed) as { data: null, error } instead of rejecting.
export type AuthClientResult = { data?: unknown; error?: AuthClientError } | null | undefined;

export const SIGN_OUT_FAILED_MESSAGE = 'Sign out failed. Check your connection and try again.';
export const SIGN_OUT_RATE_LIMITED_MESSAGE = 'Sign out failed: too many requests. Wait a moment and try again.';

// Better Auth answers sign-out with 400 FAILED_TO_GET_SESSION when the request has no valid
// session cookie (it expired, or another tab signed out), and clears the cookie.
const hasNoSession = (error: NonNullable<AuthClientError>): boolean =>
  error.status === 401 ||
  (error.status === 400 &&
    (error.code === 'FAILED_TO_GET_SESSION' || /failed to get session/i.test(error.message ?? '')));

// Signed out only when the server confirms it. On any other failure (429, 403, 5xx, network)
// the session cookie is still valid, so the user must stay signed in and see the error.
export function interpretSignOutResult(result: AuthClientResult): AuthActionResult {
  const error = result?.error;
  if (!error || hasNoSession(error)) {
    return { ok: true };
  }
  return {
    ok: false,
    error: error.status === 429 ? SIGN_OUT_RATE_LIMITED_MESSAGE : SIGN_OUT_FAILED_MESSAGE,
    errorCode: 'UNKNOWN',
  };
}

// Returns logout(): signs out, and clears the local session only once the server has.
// Calls made while a sign-out is in flight share its request.
export function createSignOutRunner(
  signOut: () => Promise<AuthClientResult>,
  onSignedOut: () => void,
): () => Promise<AuthActionResult> {
  let inFlight: Promise<AuthActionResult> | null = null;

  const run = async (): Promise<AuthActionResult> => {
    let result: AuthActionResult;
    try {
      result = interpretSignOutResult(await signOut());
    } catch {
      result = { ok: false, error: SIGN_OUT_FAILED_MESSAGE, errorCode: 'UNKNOWN' };
    }
    if (result.ok) {
      onSignedOut();
    }
    return result;
  };

  return () => {
    inFlight ??= run().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

// 'unavailable': the session check failed (5xx, 429, network), so whether the user is signed
// in is unknown. Their cookie may still be valid: never treat this as signed out.
export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'unavailable';

const sessionUserSchema = z
  .object({
    id: z.string().min(1),
    email: z.string(),
    name: z.string().nullish().transform((value) => value ?? undefined),
    image: z.string().nullish(),
    username: z.string().nullish().transform((value) => value ?? undefined),
  })
  .passthrough();

export type SessionUser = z.infer<typeof sessionUserSchema>;

export type SessionCheck =
  | { kind: 'authenticated'; user: SessionUser; session: unknown }
  | { kind: 'unauthenticated' }
  | { kind: 'unknown'; status?: number };

// Only a successful answer without a session (or a 401) means signed out. Any other failure
// is unknown, including a network failure, which the client reports as status 0.
export function classifySessionResult(result: AuthClientResult): SessionCheck {
  if (!result) {
    return { kind: 'unknown' };
  }
  const { error } = result;
  if (error) {
    return error.status === 401 ? { kind: 'unauthenticated' } : { kind: 'unknown', status: error.status };
  }
  if (!result.data) {
    return { kind: 'unauthenticated' };
  }
  const user = sessionUserSchema.safeParse((result.data as { user?: unknown }).user);
  if (!user.success) {
    return (result.data as { user?: unknown }).user == null ? { kind: 'unauthenticated' } : { kind: 'unknown' };
  }
  return { kind: 'authenticated', user: user.data, session: result.data };
}

export type SessionState = { user: SessionUser | null; session: unknown; status: SessionStatus };

// An unknown check never signs anyone out: a signed-in user stays signed in, and a first
// check that fails reports 'unavailable' so the app can offer a retry instead of /login.
export function applySessionCheck(check: SessionCheck, current: SessionState): SessionState {
  if (check.kind === 'authenticated') {
    return { user: check.user, session: check.session, status: 'authenticated' };
  }
  if (check.kind === 'unauthenticated') {
    return { user: null, session: null, status: 'unauthenticated' };
  }
  return current.user
    ? { ...current, status: 'authenticated' }
    : { user: null, session: null, status: 'unavailable' };
}

export const SESSION_RETRY_DELAYS_MS = [1_000, 3_000];

// Checks the session, retrying a few times with backoff while the answer is unknown. Every
// retry counts against the auth rate limit, so the attempts are few and spaced out.
export async function checkSessionWithRetry(
  getSession: () => Promise<AuthClientResult>,
  options: { retryDelaysMs?: number[]; wait?: (ms: number) => Promise<void> } = {},
): Promise<SessionCheck> {
  const retryDelaysMs = options.retryDelaysMs ?? SESSION_RETRY_DELAYS_MS;
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let check: SessionCheck = { kind: 'unknown' };
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    if (attempt > 0) {
      await wait(retryDelaysMs[attempt - 1]);
    }
    try {
      check = classifySessionResult(await getSession());
    } catch {
      check = { kind: 'unknown' };
    }
    if (check.kind !== 'unknown') {
      return check;
    }
  }
  return check;
}

export type ProtectedRouteAction = 'render' | 'wait' | 'redirect' | 'unavailable';

// RequireAuth sends a user to /login only when the server said there is no session.
export function resolveProtectedRouteAction(status: SessionStatus): ProtectedRouteAction {
  switch (status) {
    case 'authenticated':
      return 'render';
    case 'unauthenticated':
      return 'redirect';
    case 'unavailable':
      return 'unavailable';
    default:
      return 'wait';
  }
}

// Better Auth's sign-up returns a session token unless the account must verify its email
// first (or auto sign-in is off), so the answer comes from the server, not from whether a
// later session check happened to succeed.
export function signUpRequiresEmailVerification(signUpData: unknown): boolean {
  const token = (signUpData as { token?: unknown } | null | undefined)?.token;
  return typeof token !== 'string' || token.length === 0;
}
