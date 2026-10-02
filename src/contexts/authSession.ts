import { z } from 'zod';

export type AuthErrorCode = 'EMAIL_NOT_VERIFIED' | 'UNKNOWN';

export interface AuthActionResult {
  ok: boolean;
  error?: string;
  errorCode?: AuthErrorCode;
}

type AuthClientError = { status?: number; code?: string; message?: string } | null | undefined;
export type AuthClientResult = { data?: unknown; error?: AuthClientError } | null | undefined;

export const SIGN_OUT_FAILED_MESSAGE = 'Sign out failed. Check your connection and try again.';
export const SIGN_OUT_RATE_LIMITED_MESSAGE = 'Sign out failed: too many requests. Wait a moment and try again.';

const hasNoSession = (error: NonNullable<AuthClientError>): boolean =>
  error.status === 401 ||
  (error.status === 400 &&
    (error.code === 'FAILED_TO_GET_SESSION' || /failed to get session/i.test(error.message ?? '')));

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

export const SESSION_UNCONFIRMED_MESSAGE =
  'Signed in, but your session could not be loaded. Check your connection and try again.';
const SESSION_NOT_ESTABLISHED_MESSAGE = 'Unable to establish session';

export type SignInSessionOutcome = {
  sessionToStore: Exclude<SessionCheck, { kind: 'unknown' }> | null;
  result: AuthActionResult;
};

export async function resolveSignInSession(
  signInData: unknown,
  readSession: () => Promise<SessionCheck>,
): Promise<SignInSessionOutcome> {
  let session: SessionCheck;
  try {
    session = await readSession();
  } catch {
    session = { kind: 'unknown' };
  }
  if (session.kind === 'authenticated') {
    return { sessionToStore: session, result: { ok: true } };
  }
  const signIn = classifySessionResult({ data: signInData });
  if (signIn.kind === 'authenticated') {
    return { sessionToStore: signIn, result: { ok: true } };
  }
  if (session.kind === 'unknown') {
    return { sessionToStore: null, result: { ok: false, error: SESSION_UNCONFIRMED_MESSAGE, errorCode: 'UNKNOWN' } };
  }
  return { sessionToStore: session, result: { ok: false, error: SESSION_NOT_ESTABLISHED_MESSAGE, errorCode: 'UNKNOWN' } };
}

export type SessionState = { user: SessionUser | null; session: unknown; status: SessionStatus };

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

export function signUpRequiresEmailVerification(signUpData: unknown): boolean {
  const token = (signUpData as { token?: unknown } | null | undefined)?.token;
  return typeof token !== 'string' || token.length === 0;
}
