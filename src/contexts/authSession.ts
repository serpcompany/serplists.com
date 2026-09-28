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
