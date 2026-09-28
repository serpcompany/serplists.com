import { describe, expect, it, vi } from 'vitest';

import type { SessionCheck, SessionState } from '@/contexts/authSession';
import {
  SESSION_KEEPALIVE_INTERVAL_MS,
  SESSION_RECHECK_INTERVAL_MS,
  SESSION_UNAUTHORIZED_RECHECK_INTERVAL_MS,
  createSessionSync,
  type SessionSyncChannel,
  type SessionSyncEnvironment,
} from '@/contexts/sessionSync';

// Every tab of the browser sends the same session cookie. When another tab signs in as someone
// else, or signs out, this tab must find out before it shows or writes anything as the old user.

const alice = { id: 'user-alice', email: 'alice@example.com' };
const bob = { id: 'user-bob', email: 'bob@example.com' };
const signedInAs = (user: typeof alice): SessionState => ({ user, session: { user }, status: 'authenticated' });
const signedInCheck = (user: typeof alice): SessionCheck => ({ kind: 'authenticated', user, session: { user } });

// BroadcastChannel delivers a message to every other channel with the same name, never the sender.
function createChannelHub() {
  const channels = new Map<SessionSyncChannel, (data: unknown) => void>();
  const open = (): SessionSyncChannel => {
    const channel: SessionSyncChannel = {
      postMessage: (data) => {
        channels.forEach((deliver, other) => {
          if (other !== channel) deliver(data);
        });
      },
      onMessage: (listener) => channels.set(channel, listener),
      close: () => channels.delete(channel),
    };
    channels.set(channel, () => {});
    return channel;
  };
  return { open, channels };
}

// localStorage fires a storage event in every other tab when a value is written.
function createStorageHub() {
  const listeners = new Set<(key: string | null, value: string | null) => void>();
  return {
    listeners,
    environment: (): Pick<SessionSyncEnvironment, 'writeStorage' | 'onStorage'> => {
      let own: ((key: string | null, value: string | null) => void) | null = null;
      return {
        writeStorage: (key, value) => listeners.forEach((listener) => listener !== own && listener(key, value)),
        onStorage: (listener) => {
          own = listener;
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
    },
  };
}

function createTab(options: {
  state: SessionState;
  answers?: SessionCheck[];
  readSession?: () => Promise<SessionCheck>;
  now?: () => number;
  beforeSessionLost?: (state: SessionState) => void;
}) {
  let state = options.state;
  const answers = [...(options.answers ?? [])];
  const readSession = vi.fn(options.readSession ?? (async () => answers.shift() ?? { kind: 'unknown' as const }));
  const notify = vi.fn();
  const visible = new Set<() => void>();
  const restored = new Set<() => void>();
  const unauthorized = new Set<() => void>();
  const sync = createSessionSync({
    readSession,
    getState: () => state,
    setState: (update) => {
      state = update(state);
    },
    notify,
    now: options.now,
    beforeSessionLost: options.beforeSessionLost && (() => options.beforeSessionLost?.(state)),
  });
  const environment = (overrides: Partial<SessionSyncEnvironment> = {}): SessionSyncEnvironment => ({
    openChannel: () => null,
    writeStorage: () => {},
    onStorage: () => () => {},
    onVisible: (listener) => {
      visible.add(listener);
      return () => visible.delete(listener);
    },
    onRestored: (listener) => {
      restored.add(listener);
      return () => restored.delete(listener);
    },
    onUnauthorized: (listener) => {
      unauthorized.add(listener);
      return () => unauthorized.delete(listener);
    },
    ...overrides,
  });
  return {
    sync,
    readSession,
    notify,
    environment,
    state: () => state,
    showTab: () => visible.forEach((listener) => listener()),
    restoreFromCache: () => restored.forEach((listener) => listener()),
    // An API request came back 401.
    receive401: () => unauthorized.forEach((listener) => listener()),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('session sync across tabs', () => {
  it('switches a tab signed in as Alice to Bob when another tab signs in as Bob', async () => {
    const hub = createChannelHub();
    const tab1 = createTab({ state: signedInAs(alice), answers: [signedInCheck(bob)] });
    const tab2 = createTab({ state: signedInAs(bob) });
    tab1.sync.connect(tab1.environment({ openChannel: hub.open }));
    tab2.sync.connect(tab2.environment({ openChannel: hub.open }));

    tab2.sync.announce(bob.id);
    await flush();

    expect(tab1.readSession).toHaveBeenCalledTimes(1);
    expect(tab1.state()).toMatchObject({ user: bob, status: 'authenticated' });
    expect(tab1.notify).toHaveBeenCalledWith(expect.stringContaining(bob.email));
    // The report is only a hint: the tab that announced does not re-read its own session.
    expect(tab2.readSession).not.toHaveBeenCalled();
  });

  it('signs a tab out when another tab signs out', async () => {
    const hub = createChannelHub();
    const tab1 = createTab({ state: signedInAs(alice), answers: [{ kind: 'unauthenticated' }] });
    const tab2 = createTab({ state: signedInAs(alice) });
    tab1.sync.connect(tab1.environment({ openChannel: hub.open }));
    tab2.sync.connect(tab2.environment({ openChannel: hub.open }));

    tab2.sync.announce(null);
    await flush();

    expect(tab1.state()).toEqual({ user: null, session: null, status: 'unauthenticated' });
    expect(tab1.notify).toHaveBeenCalledWith('Your session ended. Sign in again.');
  });

  it('ignores a report naming the user it already has, and reports while it is still loading', async () => {
    const hub = createChannelHub();
    const tab1 = createTab({ state: signedInAs(alice) });
    const loading = createTab({ state: { user: null, session: null, status: 'loading' } });
    const tab2 = createTab({ state: signedInAs(alice) });
    [tab1, loading, tab2].forEach((tab) => tab.sync.connect(tab.environment({ openChannel: hub.open })));

    tab2.sync.announce(alice.id);
    await flush();

    expect(tab1.readSession).not.toHaveBeenCalled();
    expect(loading.readSession).not.toHaveBeenCalled();
  });

  it('keeps the current user, and the same state object, when the check fails or finds the same user', async () => {
    const hub = createChannelHub();
    const tab1 = createTab({ state: signedInAs(alice), answers: [{ kind: 'unknown', status: 503 }, signedInCheck(alice)] });
    const tab2 = createTab({ state: signedInAs(bob) });
    tab1.sync.connect(tab1.environment({ openChannel: hub.open }));
    tab2.sync.connect(tab2.environment({ openChannel: hub.open }));
    const before = tab1.state();

    tab2.sync.announce(bob.id);
    await flush();
    tab2.sync.announce(bob.id);
    await flush();

    expect(tab1.readSession).toHaveBeenCalledTimes(2);
    expect(tab1.state()).toBe(before);
    expect(tab1.notify).not.toHaveBeenCalled();
  });

  it('checks once more after a running check, since that one may have read the old session', async () => {
    const hub = createChannelHub();
    const pending: Array<(check: SessionCheck) => void> = [];
    const tab1 = createTab({
      state: signedInAs(alice),
      readSession: () => new Promise<SessionCheck>((resolve) => pending.push(resolve)),
    });
    const tab2 = createTab({ state: signedInAs(bob) });
    tab1.sync.connect(tab1.environment({ openChannel: hub.open }));
    tab2.sync.connect(tab2.environment({ openChannel: hub.open }));

    tab2.sync.announce(bob.id);
    tab2.sync.announce(bob.id);
    tab2.sync.announce(bob.id);
    expect(tab1.readSession).toHaveBeenCalledTimes(1);

    pending.shift()?.(signedInCheck(alice));
    await flush();
    expect(tab1.readSession).toHaveBeenCalledTimes(2);

    pending.shift()?.(signedInCheck(bob));
    await flush();
    expect(tab1.readSession).toHaveBeenCalledTimes(2);
    expect(tab1.state().user).toEqual(bob);
  });

  it('drops a session answer that started before a newer one was applied', async () => {
    const hub = createChannelHub();
    const tab1 = createTab({ state: signedInAs(alice), answers: [signedInCheck(bob)] });
    const tab2 = createTab({ state: signedInAs(bob) });
    tab1.sync.connect(tab1.environment({ openChannel: hub.open }));
    tab2.sync.connect(tab2.environment({ openChannel: hub.open }));

    // The first page-load check is still out when the other tab's sign-in arrives.
    const initialLoad = tab1.sync.beginRead();
    tab2.sync.announce(bob.id);
    await flush();

    expect(tab1.state().user).toEqual(bob);
    expect(tab1.sync.acceptRead(initialLoad)).toBe(false);
  });

  it('does not let a failed re-check drop an older answer that is still coming', async () => {
    const hub = createChannelHub();
    const tab1 = createTab({ state: { user: null, session: null, status: 'unavailable' }, answers: [{ kind: 'unknown' }] });
    const tab2 = createTab({ state: signedInAs(bob) });
    tab1.sync.connect(tab1.environment({ openChannel: hub.open }));
    tab2.sync.connect(tab2.environment({ openChannel: hub.open }));

    const retry = tab1.sync.beginRead();
    tab2.sync.announce(bob.id);
    await flush();

    expect(tab1.readSession).toHaveBeenCalledTimes(1);
    expect(tab1.sync.acceptRead(retry)).toBe(true);
  });

  it('lets a sign-in or sign-out in this tab win over a check still in flight', async () => {
    let resolveCheck: (check: SessionCheck) => void = () => {};
    const hub = createChannelHub();
    const tab1 = createTab({
      state: signedInAs(alice),
      readSession: () => new Promise<SessionCheck>((resolve) => { resolveCheck = resolve; }),
    });
    const tab2 = createTab({ state: signedInAs(bob) });
    tab1.sync.connect(tab1.environment({ openChannel: hub.open }));
    tab2.sync.connect(tab2.environment({ openChannel: hub.open }));

    tab2.sync.announce(bob.id);
    tab1.sync.claim();
    resolveCheck(signedInCheck(bob));
    await flush();

    expect(tab1.state().user).toEqual(alice);
  });

  it('falls back to storage events when BroadcastChannel is missing, and ignores malformed values', async () => {
    const storage = createStorageHub();
    const tab1 = createTab({ state: signedInAs(alice), answers: [signedInCheck(bob)] });
    const tab2 = createTab({ state: signedInAs(bob) });
    tab1.sync.connect(tab1.environment(storage.environment()));
    tab2.sync.connect(tab2.environment(storage.environment()));

    storage.listeners.forEach((listener) => listener('serplists.sessionChanged', '{not json'));
    storage.listeners.forEach((listener) => listener('serplists.sessionChanged', JSON.stringify({ userId: 42 })));
    storage.listeners.forEach((listener) => listener('another-key', JSON.stringify({ userId: bob.id })));
    await flush();
    expect(tab1.readSession).not.toHaveBeenCalled();

    tab2.sync.announce(bob.id);
    await flush();
    expect(tab1.state().user).toEqual(bob);
  });

  it('re-checks when the tab comes back into view at most once a minute, and always after a cache restore', async () => {
    let now = 1_000_000;
    const tab = createTab({
      state: signedInAs(alice),
      answers: [signedInCheck(alice), signedInCheck(alice), signedInCheck(alice), signedInCheck(bob)],
      now: () => now,
    });
    tab.sync.connect(tab.environment());

    tab.showTab();
    await flush();
    now += 10_000;
    tab.showTab();
    await flush();
    expect(tab.readSession).toHaveBeenCalledTimes(1);

    now += SESSION_RECHECK_INTERVAL_MS;
    tab.showTab();
    await flush();
    expect(tab.readSession).toHaveBeenCalledTimes(2);

    tab.restoreFromCache();
    await flush();
    expect(tab.readSession).toHaveBeenCalledTimes(3);

    now += SESSION_RECHECK_INTERVAL_MS;
    tab.showTab();
    await flush();
    expect(tab.state().user).toEqual(bob);
  });

  it('stops listening and closes its channel when disconnected', async () => {
    const hub = createChannelHub();
    const tab1 = createTab({ state: signedInAs(alice), answers: [signedInCheck(bob)] });
    const tab2 = createTab({ state: signedInAs(bob) });
    const disconnect = tab1.sync.connect(tab1.environment({ openChannel: hub.open }));
    tab2.sync.connect(tab2.environment({ openChannel: hub.open }));

    disconnect();
    tab2.sync.announce(bob.id);
    tab1.showTab();
    await flush();

    expect(hub.channels.size).toBe(1);
    expect(tab1.readSession).not.toHaveBeenCalled();
  });
});

// The session can also end on the server: it expires, or the user signs out other sessions or
// changes their password on another device. Every request then gets a 401.
describe('session sync after a 401', () => {
  it('signs the tab out when the server confirms the session is gone', async () => {
    const tab = createTab({ state: signedInAs(alice), answers: [{ kind: 'unauthenticated' }] });
    tab.sync.connect(tab.environment());

    tab.receive401();
    await flush();

    expect(tab.state()).toEqual({ user: null, session: null, status: 'unauthenticated' });
    expect(tab.notify).toHaveBeenCalledWith('Your session ended. Sign in again.');
  });

  it('keeps the user when the check cannot reach the server or still finds the session', async () => {
    const tab = createTab({ state: signedInAs(alice), answers: [{ kind: 'unknown', status: 0 }, signedInCheck(alice)] });
    tab.sync.connect(tab.environment());
    const before = tab.state();

    tab.receive401();
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(tab.state()).toBe(before);
    expect(tab.notify).not.toHaveBeenCalled();
  });

  it('checks once for a burst of 401s from parallel requests, and not again right away', async () => {
    let now = 1_000_000;
    let resolveCheck: (check: SessionCheck) => void = () => {};
    const tab = createTab({
      state: signedInAs(alice),
      readSession: () => new Promise<SessionCheck>((resolve) => { resolveCheck = resolve; }),
      now: () => now,
    });
    tab.sync.connect(tab.environment());

    tab.receive401();
    tab.receive401();
    tab.receive401();
    resolveCheck(signedInCheck(alice));
    await flush();
    tab.receive401();
    await flush();
    expect(tab.readSession).toHaveBeenCalledTimes(1);

    now += SESSION_UNAUTHORIZED_RECHECK_INTERVAL_MS;
    tab.receive401();
    expect(tab.readSession).toHaveBeenCalledTimes(2);
  });

  it('checks on a 401 right after sign-in or page load, when the session may just have ended', async () => {
    const tab = createTab({ state: signedInAs(alice), answers: [{ kind: 'unauthenticated' }], now: () => 5_000 });
    tab.sync.connect(tab.environment());
    tab.sync.claim();

    tab.receive401();
    await flush();

    expect(tab.state().status).toBe('unauthenticated');
  });

  it('ignores a 401 while signed out or still loading', async () => {
    const signedOut = createTab({ state: { user: null, session: null, status: 'unauthenticated' } });
    const loading = createTab({ state: { user: null, session: null, status: 'loading' } });
    [signedOut, loading].forEach((tab) => tab.sync.connect(tab.environment()));

    signedOut.receive401();
    loading.receive401();
    await flush();

    expect(signedOut.readSession).not.toHaveBeenCalled();
    expect(loading.readSession).not.toHaveBeenCalled();
  });
});

// Only get-session extends a session and resends its cookie, so an open tab must read it now
// and then. Focus and a timer ask keepAlive(), which reads at most once per interval.
describe('session keep-alive', () => {
  it('reads the session once per interval, however often the tab regains focus', async () => {
    let now = 1_000_000;
    const tab = createTab({
      state: signedInAs(alice),
      answers: [signedInCheck(alice), signedInCheck(alice)],
      now: () => now,
    });
    tab.sync.connect(tab.environment());
    tab.sync.claim();

    expect(tab.sync.keepAlive()).toBe(false);
    now += SESSION_KEEPALIVE_INTERVAL_MS - 1;
    expect(tab.sync.keepAlive()).toBe(false);
    now += 1;
    expect(tab.sync.keepAlive()).toBe(true);
    await flush();
    expect(tab.sync.keepAlive()).toBe(false);
    now += SESSION_KEEPALIVE_INTERVAL_MS;
    expect(tab.sync.keepAlive()).toBe(true);
    await flush();

    expect(tab.readSession).toHaveBeenCalledTimes(2);
    expect(tab.state().user).toEqual(alice);
  });

  it('does not start a read while another check runs', async () => {
    let now = 1_000_000;
    const tab = createTab({ state: signedInAs(alice), answers: [signedInCheck(alice)], now: () => now });
    tab.sync.connect(tab.environment());
    tab.sync.claim();
    now += SESSION_KEEPALIVE_INTERVAL_MS;

    expect([tab.sync.keepAlive(), tab.sync.keepAlive()]).toEqual([true, false]);
    await flush();

    expect(tab.readSession).toHaveBeenCalledTimes(1);
  });

  it('keeps the user when the read fails and signs out when the session has expired', async () => {
    let now = 1_000_000;
    const tab = createTab({
      state: signedInAs(alice),
      answers: [{ kind: 'unknown', status: 0 }, { kind: 'unauthenticated' }],
      now: () => now,
    });
    tab.sync.connect(tab.environment());
    tab.sync.claim();

    now += SESSION_KEEPALIVE_INTERVAL_MS;
    tab.sync.keepAlive();
    await flush();
    expect(tab.state().user).toEqual(alice);

    now += SESSION_KEEPALIVE_INTERVAL_MS;
    tab.sync.keepAlive();
    await flush();
    expect(tab.state().status).toBe('unauthenticated');
  });

  it('never reads for a signed-out or loading tab', () => {
    const signedOut = createTab({ state: { user: null, session: null, status: 'unauthenticated' } });
    const loading = createTab({ state: { user: null, session: null, status: 'loading' } });

    expect(signedOut.sync.keepAlive()).toBe(false);
    expect(loading.sync.keepAlive()).toBe(false);
    expect(signedOut.readSession).not.toHaveBeenCalled();
    expect(loading.readSession).not.toHaveBeenCalled();
  });
});

// A background sign-out (another tab signed out, the session expired or was revoked) unmounts
// every signed-in page without asking. Pages with unsaved work keep it first, while the tab
// still shows the user who typed it (src/lib/navigation/leaveGuard.ts).
describe('keeping unsaved work before a background session change', () => {
  it("runs before another tab's sign-out signs this tab out", async () => {
    const hub = createChannelHub();
    const beforeSessionLost = vi.fn();
    const tab1 = createTab({ state: signedInAs(alice), answers: [{ kind: 'unauthenticated' }], beforeSessionLost });
    const tab2 = createTab({ state: signedInAs(alice) });
    tab1.sync.connect(tab1.environment({ openChannel: hub.open }));
    tab2.sync.connect(tab2.environment({ openChannel: hub.open }));

    tab2.sync.announce(null);
    await flush();

    expect(beforeSessionLost).toHaveBeenCalledTimes(1);
    expect(beforeSessionLost).toHaveBeenCalledWith(signedInAs(alice));
    expect(tab1.state().status).toBe('unauthenticated');
  });

  it('runs before a 401, a visibility or restore re-check, or the keep-alive ends the session', async () => {
    let now = 1_000_000;
    const beforeSessionLost = vi.fn();
    const signOuts = [
      (tab: ReturnType<typeof createTab>) => tab.receive401(),
      (tab: ReturnType<typeof createTab>) => tab.showTab(),
      (tab: ReturnType<typeof createTab>) => tab.restoreFromCache(),
      (tab: ReturnType<typeof createTab>) => {
        now += SESSION_KEEPALIVE_INTERVAL_MS;
        tab.sync.keepAlive();
      },
    ];
    for (const signOut of signOuts) {
      const tab = createTab({
        state: signedInAs(alice),
        answers: [{ kind: 'unauthenticated' }],
        beforeSessionLost,
        now: () => now,
      });
      tab.sync.connect(tab.environment());
      signOut(tab);
      await flush();
      expect(tab.state().status).toBe('unauthenticated');
    }

    expect(beforeSessionLost).toHaveBeenCalledTimes(signOuts.length);
    beforeSessionLost.mock.calls.forEach(([state]) => expect(state).toEqual(signedInAs(alice)));
  });

  it('runs before the tab switches to a user another tab signed in as', async () => {
    const hub = createChannelHub();
    const beforeSessionLost = vi.fn();
    const tab1 = createTab({ state: signedInAs(alice), answers: [signedInCheck(bob)], beforeSessionLost });
    const tab2 = createTab({ state: signedInAs(bob) });
    tab1.sync.connect(tab1.environment({ openChannel: hub.open }));
    tab2.sync.connect(tab2.environment({ openChannel: hub.open }));

    tab2.sync.announce(bob.id);
    await flush();

    expect(beforeSessionLost).toHaveBeenCalledWith(signedInAs(alice));
    expect(tab1.state().user).toEqual(bob);
  });

  it('does not run when the check fails, finds the same user, or the tab is already signed out', async () => {
    const hub = createChannelHub();
    const beforeSessionLost = vi.fn();
    const signedIn = createTab({
      state: signedInAs(alice),
      answers: [{ kind: 'unknown', status: 503 }, signedInCheck(alice)],
      beforeSessionLost,
    });
    const signedOut = createTab({
      state: { user: null, session: null, status: 'unauthenticated' },
      answers: [{ kind: 'unauthenticated' }],
      beforeSessionLost,
    });
    const tab2 = createTab({ state: signedInAs(bob) });
    [signedIn, signedOut, tab2].forEach((tab) => tab.sync.connect(tab.environment({ openChannel: hub.open })));

    tab2.sync.announce(bob.id);
    await flush();
    tab2.sync.announce(bob.id);
    await flush();

    expect(signedIn.readSession).toHaveBeenCalledTimes(2);
    expect(signedOut.readSession).toHaveBeenCalled();
    expect(beforeSessionLost).not.toHaveBeenCalled();
  });

  it('does not run for an answer that a sign-in or sign-out in this tab replaced', async () => {
    let resolveCheck: (check: SessionCheck) => void = () => {};
    const hub = createChannelHub();
    const beforeSessionLost = vi.fn();
    const tab1 = createTab({
      state: signedInAs(alice),
      readSession: () => new Promise<SessionCheck>((resolve) => { resolveCheck = resolve; }),
      beforeSessionLost,
    });
    const tab2 = createTab({ state: signedInAs(bob) });
    tab1.sync.connect(tab1.environment({ openChannel: hub.open }));
    tab2.sync.connect(tab2.environment({ openChannel: hub.open }));

    tab2.sync.announce(null);
    tab1.sync.claim();
    resolveCheck({ kind: 'unauthenticated' });
    await flush();

    expect(beforeSessionLost).not.toHaveBeenCalled();
  });
});
