/**
 * Interprets Better Auth `getSession()` answers. The client does not throw on
 * HTTP errors: a 429, a 5xx, or a network failure (status 0) comes back as
 * `{ data: null, error }`. Only a successful empty answer or a 401 means the
 * visitor is signed out; anything else means the session state is unknown and
 * must not log a signed-in user out.
 */

export interface SessionUser {
  id: string;
  email: string;
  name?: string;
  image?: string | null;
  username?: string;
}

export type SessionCheck =
  | { kind: 'authenticated'; user: SessionUser; session: unknown }
  | { kind: 'anonymous' }
  | { kind: 'unknown'; status: number | null };

export type SessionFetchResult =
  | {
      data?: { user?: unknown } | null;
      error?: { status?: number } | null;
    }
  | null
  | undefined;

export function classifySessionResult(result: SessionFetchResult): SessionCheck {
  if (!result) return { kind: 'unknown', status: null };

  const user = result.data?.user;
  if (user) {
    // Shape comes from the Better Auth client's typed session response.
    return { kind: 'authenticated', user: user as SessionUser, session: result.data };
  }

  const error = result.error;
  if (!error || error.status === 401) return { kind: 'anonymous' };
  return { kind: 'unknown', status: typeof error.status === 'number' ? error.status : null };
}

/** Waits between attempts when a session check gives no definite answer (about 15s in total). */
export const SESSION_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000, 8000];

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function checkSessionWithRetry(
  getSession: () => Promise<SessionFetchResult>,
  options: {
    delaysMs?: readonly number[];
    sleep?: (ms: number) => Promise<void>;
    isCancelled?: () => boolean;
  } = {},
): Promise<SessionCheck> {
  const delays = options.delaysMs ?? SESSION_RETRY_DELAYS_MS;
  const sleep = options.sleep ?? wait;
  let outcome: SessionCheck = { kind: 'unknown', status: null };

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    if (attempt > 0) {
      if (options.isCancelled?.()) return outcome;
      await sleep(delays[attempt - 1]);
    }
    if (options.isCancelled?.()) return outcome;

    outcome = await getSession().then(
      classifySessionResult,
      (): SessionCheck => ({ kind: 'unknown', status: null }),
    );
    if (outcome.kind !== 'unknown') return outcome;
  }

  return outcome;
}

/**
 * How often an open, signed-in tab calls get-session. Only that route extends a
 * session (Better Auth refreshes it once a day and resends the 7-day cookie), so
 * a tab left open for days must call it well inside that day.
 */
export const SESSION_RECHECK_MIN_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Returns a throttled re-check: at most one get-session call per interval and
 * never two at once. The interval starts now, right after the check that
 * signed the user in.
 */
export function createSessionRechecker(options: {
  getSession: () => Promise<SessionFetchResult>;
  onResult: (outcome: SessionCheck) => void;
  minIntervalMs?: number;
  now?: () => number;
}): () => Promise<boolean> {
  const now = options.now ?? Date.now;
  const minIntervalMs = options.minIntervalMs ?? SESSION_RECHECK_MIN_INTERVAL_MS;
  let lastCheckedAt = now();
  let inFlight = false;

  return async () => {
    if (inFlight || now() - lastCheckedAt < minIntervalMs) return false;
    inFlight = true;
    lastCheckedAt = now();
    try {
      const outcome = await options.getSession().then(
        classifySessionResult,
        (): SessionCheck => ({ kind: 'unknown', status: null }),
      );
      options.onResult(outcome);
    } finally {
      inFlight = false;
    }
    return true;
  };
}

/** True when a refreshed user has the same visible fields, so state can keep the old object. */
export function isSameSessionUser(current: SessionUser | null, next: SessionUser): boolean {
  return (
    current !== null &&
    current.id === next.id &&
    current.email === next.email &&
    current.name === next.name &&
    current.image === next.image &&
    current.username === next.username
  );
}

export type RequireAuthState = 'loading' | 'allowed' | 'unavailable' | 'redirect';

/** What a protected route shows. Only a definite signed-out answer sends the visitor to /login. */
export function requireAuthState(auth: {
  isLoading: boolean;
  isAuthenticated: boolean;
  sessionUnavailable: boolean;
}): RequireAuthState {
  if (auth.isAuthenticated) return 'allowed';
  if (auth.isLoading) return 'loading';
  if (auth.sessionUnavailable) return 'unavailable';
  return 'redirect';
}
