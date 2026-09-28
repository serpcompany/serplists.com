import { z } from 'zod';

import { getLocalStorage } from '@/lib/browserStorage';
import { onUnauthorizedResponse } from '@/lib/unauthorizedResponses';

import { applySessionCheck, type SessionCheck, type SessionState } from './authSession';

// Every tab of a browser sends the same session cookie, so when one tab signs in as someone
// else or signs out, the others must follow before they show or write anything as the old user.
// A tab that signs in or out announces it on a BroadcastChannel (a storage event where that is
// missing). The message is only a hint: the other tabs re-read the session and trust the
// server's answer. A tab also re-reads it when it comes back into view, at most once per
// SESSION_RECHECK_INTERVAL_MS (each check reads the session from D1), and after a restore from
// the back/forward cache, where it may have missed messages.
//
// The session can also end on the server (it expired, or the user signed out other sessions or
// changed their password elsewhere). Every API request then gets a 401, which the API client
// reports; the tab re-reads the session and signs out only if the server confirms it is gone.

export const SESSION_SYNC_CHANNEL = 'serplists-auth';
export const SESSION_SYNC_STORAGE_KEY = 'serplists.sessionChanged';
// Matches the Organizations list staleTime, so a focus refetch rarely runs without a check.
export const SESSION_RECHECK_INTERVAL_MS = 60_000;
// A burst of 401s from parallel requests costs one check, and repeats wait this long.
export const SESSION_UNAUTHORIZED_RECHECK_INTERVAL_MS = 5_000;
// Only GET /api/auth/get-session extends a session: Better Auth refreshes it at most once a
// day and resends the 7-day cookie, which only reaches the browser from that route. So a tab
// left open (and visible) for days reads it at least this often (keepAlive()).
export const SESSION_KEEPALIVE_INTERVAL_MS = 60 * 60 * 1000;

export type SessionSyncChannel = {
  postMessage: (message: unknown) => void;
  onMessage: (listener: (data: unknown) => void) => void;
  close: () => void;
};

export type SessionSyncEnvironment = {
  openChannel: () => SessionSyncChannel | null;
  writeStorage: (key: string, value: string) => void;
  onStorage: (listener: (key: string | null, value: string | null) => void) => () => void;
  onVisible: (listener: () => void) => () => void;
  onRestored: (listener: () => void) => () => void;
  onUnauthorized: (listener: () => void) => () => void;
};

type ConfirmedSessionCheck = Exclude<SessionCheck, { kind: 'unknown' }>;

const sessionReportSchema = z.object({ userId: z.string().min(1).nullable() });

const parseReport = (data: unknown): string | null | undefined => {
  const report = sessionReportSchema.safeParse(data);
  return report.success ? report.data.userId : undefined;
};

// Applies a background re-check. Only a confirmed different user or a sign-out changes the
// state; the same user keeps the current state object, so nothing re-renders.
export function applySessionRecheck(check: ConfirmedSessionCheck, current: SessionState): SessionState {
  if (check.kind === 'authenticated' && current.user?.id === check.user.id) return current;
  if (check.kind === 'unauthenticated' && current.status === 'unauthenticated') return current;
  return applySessionCheck(check, current);
}

export function describeSessionChange(previous: SessionState, check: ConfirmedSessionCheck): string | null {
  if (!previous.user) return null;
  if (check.kind === 'unauthenticated') return 'Your session ended. Sign in again.';
  return check.user.id === previous.user.id ? null : `Signed in as ${check.user.email} in another tab.`;
}

export function createSessionSync(deps: {
  readSession: () => Promise<SessionCheck>;
  getState: () => SessionState;
  setState: (update: (current: SessionState) => SessionState) => void;
  notify: (message: string) => void;
  now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  // Session answers can arrive out of order. Each read takes a ticket when it starts, and its
  // answer is used only if no read that started later, and no sign-in or sign-out in this tab,
  // was applied first.
  let ticketsIssued = 0;
  let appliedTicket = 0;
  let lastReadAt = Number.NEGATIVE_INFINITY;
  let lastUnauthorizedCheckAt = Number.NEGATIVE_INFINITY;
  let running: Promise<void> | null = null;
  let checkAgain = false;
  let post: ((userId: string | null) => void) | null = null;

  const beginRead = () => {
    ticketsIssued += 1;
    return ticketsIssued;
  };

  const acceptRead = (ticket: number): boolean => {
    lastReadAt = now();
    if (ticket <= appliedTicket) return false;
    appliedTicket = ticket;
    return true;
  };

  const checkOnce = async () => {
    const ticket = beginRead();
    let check: SessionCheck;
    try {
      check = await deps.readSession();
    } catch {
      check = { kind: 'unknown' };
    }
    // A failed check never changes who is signed in, and does not outrank an older answer.
    if (check.kind === 'unknown') {
      lastReadAt = now();
      return;
    }
    if (!acceptRead(ticket)) return;
    const message = describeSessionChange(deps.getState(), check);
    deps.setState((current) => applySessionRecheck(check, current));
    if (message) deps.notify(message);
  };

  // One check at a time. A request made while one runs schedules one more after it: the
  // running check may have read the session before the change it is now asked about.
  const recheck = (): Promise<void> => {
    if (running) {
      checkAgain = true;
      return running;
    }
    running = (async () => {
      do {
        checkAgain = false;
        await checkOnce();
      } while (checkAgain);
    })().finally(() => {
      running = null;
    });
    return running;
  };

  const onReport = (userId: string | null) => {
    const current = deps.getState();
    if (current.status === 'loading' || (current.user?.id ?? null) === userId) return;
    void recheck();
  };

  return {
    beginRead,
    acceptRead,
    // This tab set the session itself (sign-in, sign-out, profile refresh): it wins over any
    // read still in flight.
    claim: () => {
      appliedTicket = beginRead();
      lastReadAt = now();
    },
    // Tell the other tabs who this tab is signed in as, after a sign-in, sign-out or page load.
    // Tabs never announce what they learned from a re-check, so a change is announced once.
    announce: (userId: string | null) => post?.(userId),
    recheck,
    // Re-reads the session for a signed-in tab that has not read it for
    // SESSION_KEEPALIVE_INTERVAL_MS, never while another check runs. Returns whether it started.
    keepAlive: (): boolean => {
      const current = deps.getState();
      if (!current.user || current.status === 'loading' || running) return false;
      if (now() - lastReadAt < SESSION_KEEPALIVE_INTERVAL_MS) return false;
      void recheck();
      return true;
    },
    connect(environment: SessionSyncEnvironment): () => void {
      let channel: SessionSyncChannel | null = null;
      try {
        channel = environment.openChannel();
      } catch {
        channel = null;
      }
      const stops: Array<() => void> = [];
      if (channel) {
        const open = channel;
        open.onMessage((data) => {
          const userId = parseReport(data);
          if (userId !== undefined) onReport(userId);
        });
        post = (userId) => {
          try {
            open.postMessage({ userId });
          } catch {
            // A closed channel: the other tabs fall back to their visibility re-check.
          }
        };
        stops.push(() => open.close());
      } else {
        stops.push(environment.onStorage((key, value) => {
          if (key !== SESSION_SYNC_STORAGE_KEY || !value) return;
          let data: unknown;
          try {
            data = JSON.parse(value);
          } catch {
            return;
          }
          const userId = parseReport(data);
          if (userId !== undefined) onReport(userId);
        }));
        // The timestamp makes every write a change, so the storage event always fires.
        post = (userId) => environment.writeStorage(SESSION_SYNC_STORAGE_KEY, JSON.stringify({ userId, at: now() }));
      }
      stops.push(environment.onVisible(() => {
        if (deps.getState().status !== 'loading' && now() - lastReadAt >= SESSION_RECHECK_INTERVAL_MS) void recheck();
      }));
      stops.push(environment.onRestored(() => {
        if (deps.getState().status !== 'loading') void recheck();
      }));
      stops.push(environment.onUnauthorized(() => {
        const current = deps.getState();
        if (!current.user || current.status === 'loading' || running) return;
        if (now() - lastUnauthorizedCheckAt < SESSION_UNAUTHORIZED_RECHECK_INTERVAL_MS) return;
        lastUnauthorizedCheckAt = now();
        void recheck();
      }));
      return () => {
        post = null;
        stops.forEach((stop) => stop());
      };
    },
  };
}

export type SessionSync = ReturnType<typeof createSessionSync>;

// The browser wiring for createSessionSync().connect(). Storage and BroadcastChannel can be
// missing or blocked (private modes, site data blocked), so every access is guarded.
export function browserSessionSyncEnvironment(): SessionSyncEnvironment {
  return {
    openChannel: () => {
      if (typeof BroadcastChannel !== 'function') return null;
      const channel = new BroadcastChannel(SESSION_SYNC_CHANNEL);
      return {
        postMessage: (message) => channel.postMessage(message),
        onMessage: (listener) => {
          channel.onmessage = (event) => listener(event.data);
        },
        close: () => {
          channel.onmessage = null;
          channel.close();
        },
      };
    },
    writeStorage: (key, value) => {
      try {
        getLocalStorage()?.setItem(key, value);
      } catch {
        // Storage is unavailable: other tabs fall back to their visibility re-check.
      }
    },
    onStorage: (listener) => {
      const handle = (event: StorageEvent) => listener(event.key, event.newValue);
      window.addEventListener('storage', handle);
      return () => window.removeEventListener('storage', handle);
    },
    onVisible: (listener) => {
      const handle = () => {
        if (document.visibilityState === 'visible') listener();
      };
      document.addEventListener('visibilitychange', handle);
      return () => document.removeEventListener('visibilitychange', handle);
    },
    onRestored: (listener) => {
      const handle = (event: PageTransitionEvent) => {
        if (event.persisted) listener();
      };
      window.addEventListener('pageshow', handle);
      return () => window.removeEventListener('pageshow', handle);
    },
    onUnauthorized: onUnauthorizedResponse,
  };
}
