import { z } from 'zod';

import { getLocalStorage, succeedsWithoutThrowing } from '@/lib/browserStorage';
import { onUnauthorizedResponse } from '@/lib/unauthorizedResponses';

import { applySessionCheck, type SessionCheck, type SessionState, type SessionUser } from './authSession';

const SESSION_SYNC_CHANNEL = 'serplists-auth';
export const SESSION_SYNC_STORAGE_KEY = 'serplists.sessionChanged';
export const SESSION_RECHECK_INTERVAL_MS = 60_000;
export const SESSION_UNAUTHORIZED_RECHECK_INTERVAL_MS = 5_000;
export const SESSION_KEEPALIVE_INTERVAL_MS = 60 * 60 * 1000;
export const SESSION_KEEPALIVE_TICK_MS = 15 * 60 * 1000;

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

const sessionReportSchema = z.object({
  userId: z.string().min(1).nullable(),
  profileChanged: z.boolean().optional(),
});
type SessionReport = z.infer<typeof sessionReportSchema>;

const parseReport = (data: unknown): SessionReport | undefined => {
  const report = sessionReportSchema.safeParse(data);
  return report.success ? report.data : undefined;
};

const sameDisplayedProfile = (a: SessionUser, b: SessionUser): boolean =>
  a.email === b.email &&
  a.name === b.name &&
  a.username === b.username &&
  (a.image ?? null) === (b.image ?? null);

export function applySessionRecheck(check: ConfirmedSessionCheck, current: SessionState): SessionState {
  if (check.kind === 'authenticated' && current.user?.id === check.user.id) {
    return current.status === 'authenticated' && sameDisplayedProfile(current.user, check.user)
      ? current
      : { user: check.user, session: check.session, status: 'authenticated' };
  }
  if (check.kind === 'unauthenticated' && current.status === 'unauthenticated') return current;
  return applySessionCheck(check, current);
}

const endsSessionOf = (previous: SessionState, check: ConfirmedSessionCheck): boolean =>
  previous.user !== null && (check.kind === 'unauthenticated' || check.user.id !== previous.user.id);

function describeSessionChange(previous: SessionState, check: ConfirmedSessionCheck): string | null {
  if (!previous.user) return null;
  if (check.kind === 'unauthenticated') return 'Your session ended. Sign in again.';
  return check.user.id === previous.user.id ? null : `Signed in as ${check.user.email} in another tab.`;
}

export function createSessionSync(deps: {
  readSession: () => Promise<SessionCheck>;
  initialState: SessionState;
  setState: (update: (current: SessionState) => SessionState) => void;
  notify: (message: string) => void;
  now?: () => number;
  beforeSessionLost?: () => void;
}) {
  const now = deps.now ?? Date.now;
  let shownState = deps.initialState;
  let ticketsIssued = 0;
  let appliedTicket = 0;
  let lastReadAt = Number.NEGATIVE_INFINITY;
  let lastUnauthorizedCheckAt = Number.NEGATIVE_INFINITY;
  let running: Promise<void> | null = null;
  let checkAgain = false;
  let post: ((report: SessionReport) => void) | null = null;

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
    if (check.kind === 'unknown') {
      lastReadAt = now();
      return;
    }
    if (!acceptRead(ticket)) return;
    const previous = shownState;
    const message = describeSessionChange(previous, check);
    if (endsSessionOf(previous, check)) deps.beforeSessionLost?.();
    deps.setState((current) => applySessionRecheck(check, current));
    if (message) deps.notify(message);
  };

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

  const onReport = ({ userId, profileChanged }: SessionReport) => {
    const current = shownState;
    if (current.status === 'loading') return;
    const sameUser = (current.user?.id ?? null) === userId;
    if (sameUser && !(profileChanged && userId)) return;
    void recheck();
  };

  return {
    beginRead,
    acceptRead,
    observe: (state: SessionState) => {
      shownState = state;
    },
    claim: () => {
      appliedTicket = beginRead();
      lastReadAt = now();
    },
    announce: (userId: string | null) => post?.({ userId }),
    announceProfileChange: (userId: string) => post?.({ userId, profileChanged: true }),
    recheck,
    keepAlive: (): boolean => {
      const current = shownState;
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
          const report = parseReport(data);
          if (report) onReport(report);
        });
        post = (report) => {
          succeedsWithoutThrowing(() => open.postMessage(report));
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
          const report = parseReport(data);
          if (report) onReport(report);
        }));
        post = (report) => environment.writeStorage(SESSION_SYNC_STORAGE_KEY, JSON.stringify({ ...report, at: now() }));
      }
      stops.push(environment.onVisible(() => {
        if (shownState.status !== 'loading' && now() - lastReadAt >= SESSION_RECHECK_INTERVAL_MS) void recheck();
      }));
      stops.push(environment.onRestored(() => {
        if (shownState.status !== 'loading') void recheck();
      }));
      stops.push(environment.onUnauthorized(() => {
        const current = shownState;
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

export type SessionKeepAliveEnvironment = {
  isVisible: () => boolean;
  onFocus: (listener: () => void) => () => void;
};

const browserKeepAliveEnvironment = (): SessionKeepAliveEnvironment => ({
  isVisible: () => document.visibilityState === 'visible',
  onFocus: (listener) => {
    window.addEventListener('focus', listener);
    return () => window.removeEventListener('focus', listener);
  },
});

export function startSessionKeepAlive(
  keepAlive: () => unknown,
  environment: SessionKeepAliveEnvironment = browserKeepAliveEnvironment(),
): () => void {
  const keepAliveIfVisible = () => {
    if (environment.isVisible()) keepAlive();
  };
  const stopFocus = environment.onFocus(keepAliveIfVisible);
  const tick = setInterval(keepAliveIfVisible, SESSION_KEEPALIVE_TICK_MS);
  return () => {
    stopFocus();
    clearInterval(tick);
  };
}

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
      succeedsWithoutThrowing(() => getLocalStorage()?.setItem(key, value));
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
