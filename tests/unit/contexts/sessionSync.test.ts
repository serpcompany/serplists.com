import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SessionCheck, SessionState } from '@/contexts/authSession';
import {
  SESSION_KEEPALIVE_INTERVAL_MS,
  SESSION_KEEPALIVE_TICK_MS,
  SESSION_RECHECK_INTERVAL_MS,
  SESSION_UNAUTHORIZED_RECHECK_INTERVAL_MS,
  applySessionRecheck,
  createSessionSync,
  startSessionKeepAlive,
  type SessionSyncChannel,
  type SessionSyncEnvironment,
} from '@/contexts/sessionSync';

const alice = { id: 'user-alice', email: 'alice@example.com' };
const bob = { id: 'user-bob', email: 'bob@example.com' };
const signedInAs = (user: typeof alice): SessionState => ({ user, session: { user }, status: 'authenticated' });
const signedInCheck = (user: typeof alice): SessionCheck => ({ kind: 'authenticated', user, session: { user } });

function createBroadcastChannelHub() {
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

function createStorageEventHub() {
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
    initialState: state,
    setState: (update) => showAndObserveAsAuthProviderDoes(update(state)),
    notify,
    now: options.now,
    beforeSessionLost: options.beforeSessionLost && (() => options.beforeSessionLost?.(state)),
  });
  function showAndObserveAsAuthProviderDoes(next: SessionState) {
    state = next;
    sync.observe(next);
  }
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
    answerAnApiRequestWith401: () => unauthorized.forEach((listener) => listener()),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('session sync across tabs, which share one session cookie', () => {
  it('switches a tab signed in as Alice to Bob when another tab signs in as Bob, while the announcing tab reads nothing', async () => {
    const hub = createBroadcastChannelHub();
    const tab1 = createTab({ state: signedInAs(alice), answers: [signedInCheck(bob)] });
    const tab2 = createTab({ state: signedInAs(bob) });
    tab1.sync.connect(tab1.environment({ openChannel: hub.open }));
    tab2.sync.connect(tab2.environment({ openChannel: hub.open }));

    tab2.sync.announce(bob.id);
    await flush();

    expect(tab1.readSession).toHaveBeenCalledTimes(1);
    expect(tab1.state()).toMatchObject({ user: bob, status: 'authenticated' });
    expect(tab1.notify).toHaveBeenCalledWith(expect.stringContaining(bob.email));
    expect(tab2.readSession).not.toHaveBeenCalled();
  });

  it('signs a tab out when another tab signs out', async () => {
    const hub = createBroadcastChannelHub();
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
    const hub = createBroadcastChannelHub();
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
    const hub = createBroadcastChannelHub();
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
    const hub = createBroadcastChannelHub();
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
    const hub = createBroadcastChannelHub();
    const tab1 = createTab({ state: signedInAs(alice), answers: [signedInCheck(bob)] });
    const tab2 = createTab({ state: signedInAs(bob) });
    tab1.sync.connect(tab1.environment({ openChannel: hub.open }));
    tab2.sync.connect(tab2.environment({ openChannel: hub.open }));

    const pageLoadCheckStillOut = tab1.sync.beginRead();
    tab2.sync.announce(bob.id);
    await flush();

    expect(tab1.state().user).toEqual(bob);
    expect(tab1.sync.acceptRead(pageLoadCheckStillOut)).toBe(false);
  });

  it('does not let a failed re-check drop an older answer that is still coming', async () => {
    const hub = createBroadcastChannelHub();
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
    const hub = createBroadcastChannelHub();
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
    const storage = createStorageEventHub();
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
    const hub = createBroadcastChannelHub();
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

describe('session sync after a 401, which every request gets once the server ended the session on its own', () => {
  it('signs the tab out when the server confirms the session is gone', async () => {
    const tab = createTab({ state: signedInAs(alice), answers: [{ kind: 'unauthenticated' }] });
    tab.sync.connect(tab.environment());

    tab.answerAnApiRequestWith401();
    await flush();

    expect(tab.state()).toEqual({ user: null, session: null, status: 'unauthenticated' });
    expect(tab.notify).toHaveBeenCalledWith('Your session ended. Sign in again.');
  });

  it('keeps the user when the check cannot reach the server or still finds the session', async () => {
    const tab = createTab({ state: signedInAs(alice), answers: [{ kind: 'unknown', status: 0 }, signedInCheck(alice)] });
    tab.sync.connect(tab.environment());
    const before = tab.state();

    tab.answerAnApiRequestWith401();
    await flush();
    await flush();

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

    tab.answerAnApiRequestWith401();
    tab.answerAnApiRequestWith401();
    tab.answerAnApiRequestWith401();
    resolveCheck(signedInCheck(alice));
    await flush();
    tab.answerAnApiRequestWith401();
    await flush();
    expect(tab.readSession).toHaveBeenCalledTimes(1);

    now += SESSION_UNAUTHORIZED_RECHECK_INTERVAL_MS;
    tab.answerAnApiRequestWith401();
    expect(tab.readSession).toHaveBeenCalledTimes(2);
  });

  it('checks on a 401 right after sign-in or page load, when the session may just have ended', async () => {
    const tab = createTab({ state: signedInAs(alice), answers: [{ kind: 'unauthenticated' }], now: () => 5_000 });
    tab.sync.connect(tab.environment());
    tab.sync.claim();

    tab.answerAnApiRequestWith401();
    await flush();

    expect(tab.state().status).toBe('unauthenticated');
  });

  it('ignores a 401 while signed out or still loading', async () => {
    const signedOut = createTab({ state: { user: null, session: null, status: 'unauthenticated' } });
    const loading = createTab({ state: { user: null, session: null, status: 'loading' } });
    [signedOut, loading].forEach((tab) => tab.sync.connect(tab.environment()));

    signedOut.answerAnApiRequestWith401();
    loading.answerAnApiRequestWith401();
    await flush();

    expect(signedOut.readSession).not.toHaveBeenCalled();
    expect(loading.readSession).not.toHaveBeenCalled();
  });
});

describe('session keep-alive, the only read that extends the session and resends its cookie', () => {
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

describe('keeping unsaved work before a background session change, while the tab still shows the user who typed it', () => {
  it("runs before another tab's sign-out signs this tab out", async () => {
    const hub = createBroadcastChannelHub();
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
      (tab: ReturnType<typeof createTab>) => tab.answerAnApiRequestWith401(),
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
    const hub = createBroadcastChannelHub();
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
    const hub = createBroadcastChannelHub();
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
    const hub = createBroadcastChannelHub();
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

describe('profile changes made in another tab, which reach this tab through its session re-checks', () => {
  const aliceProfile = { id: 'user-alice', email: 'alice@example.com', name: 'Alice', username: 'alice', image: null };

  it('replaces the user when the same account comes back with a changed profile', () => {
    const current: SessionState = { user: aliceProfile, session: { v: 1 }, status: 'authenticated' };
    const changes = [
      { username: 'alice2' },
      { name: 'Alice Smith' },
      { image: 'https://cdn.example.com/alice.png' },
      { email: 'alice@example.org' },
    ];
    changes.forEach((change) => {
      const user = { ...aliceProfile, ...change };
      expect(applySessionRecheck({ kind: 'authenticated', user, session: { v: 2 } }, current)).toEqual({
        user,
        session: { v: 2 },
        status: 'authenticated',
      });
    });
  });

  it('keeps the same state object when only the session record changed', () => {
    const current: SessionState = { user: aliceProfile, session: { expiresAt: 1 }, status: 'authenticated' };

    expect(
      applySessionRecheck({ kind: 'authenticated', user: { ...aliceProfile, image: undefined }, session: { expiresAt: 2 } }, current),
    ).toBe(current);
  });

  it('completes the username-less user a sign-in kept when its session read failed', () => {
    const partial = { id: 'user-alice', email: 'alice@example.com', name: 'Alice' };
    const current: SessionState = { user: partial, session: {}, status: 'authenticated' };

    expect(applySessionRecheck({ kind: 'authenticated', user: aliceProfile, session: {} }, current).user).toEqual(aliceProfile);
  });

  it('shows the new username after a visible re-check, without a toast', async () => {
    const renamed = { ...aliceProfile, username: 'alice2' };
    const tab = createTab({
      state: { user: aliceProfile, session: {}, status: 'authenticated' },
      answers: [{ kind: 'authenticated', user: renamed, session: {} }],
    });
    tab.sync.connect(tab.environment());

    tab.showTab();
    await flush();

    expect(tab.state().user?.username).toBe('alice2');
    expect(tab.notify).not.toHaveBeenCalled();
  });

  it('re-reads the session when another tab of the same user announces a profile change', async () => {
    const hub = createBroadcastChannelHub();
    const renamed = { ...aliceProfile, username: 'alice2' };
    const tab1 = createTab({
      state: { user: aliceProfile, session: {}, status: 'authenticated' },
      answers: [{ kind: 'authenticated', user: renamed, session: {} }],
    });
    const tab2 = createTab({ state: { user: renamed, session: {}, status: 'authenticated' } });
    tab1.sync.connect(tab1.environment({ openChannel: hub.open }));
    tab2.sync.connect(tab2.environment({ openChannel: hub.open }));

    tab2.sync.announceProfileChange(renamed.id);
    await flush();

    expect(tab1.readSession).toHaveBeenCalledTimes(1);
    expect(tab1.state().user?.username).toBe('alice2');
    expect(tab2.readSession).not.toHaveBeenCalled();
  });

  it('carries the profile change over the storage fallback too', async () => {
    const storage = createStorageEventHub();
    const tab1 = createTab({
      state: { user: aliceProfile, session: {}, status: 'authenticated' },
      answers: [{ kind: 'authenticated', user: { ...aliceProfile, name: 'Alice Smith' }, session: {} }],
    });
    const tab2 = createTab({ state: { user: aliceProfile, session: {}, status: 'authenticated' } });
    tab1.sync.connect(tab1.environment(storage.environment()));
    tab2.sync.connect(tab2.environment(storage.environment()));

    tab2.sync.announceProfileChange(aliceProfile.id);
    await flush();

    expect(tab1.state().user?.name).toBe('Alice Smith');
  });
});

describe('starting the session keep-alive', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const createEnvironment = () => {
    const focusListeners = new Set<() => void>();
    const environment = {
      visible: true,
      isVisible: () => environment.visible,
      onFocus: (listener: () => void) => {
        focusListeners.add(listener);
        return () => focusListeners.delete(listener);
      },
      focus: () => focusListeners.forEach((listener) => listener()),
      focusListeners,
    };
    return environment;
  };

  it('asks on focus and on every tick while the tab is visible', () => {
    vi.useFakeTimers();
    const keepAlive = vi.fn();
    const environment = createEnvironment();
    startSessionKeepAlive(keepAlive, environment);

    environment.focus();
    expect(keepAlive).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(SESSION_KEEPALIVE_TICK_MS - 1);
    expect(keepAlive).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(keepAlive).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(SESSION_KEEPALIVE_TICK_MS);
    expect(keepAlive).toHaveBeenCalledTimes(3);
  });

  it('does not ask while the tab is hidden', () => {
    vi.useFakeTimers();
    const keepAlive = vi.fn();
    const environment = createEnvironment();
    environment.visible = false;
    startSessionKeepAlive(keepAlive, environment);

    environment.focus();
    vi.advanceTimersByTime(SESSION_KEEPALIVE_TICK_MS * 2);

    expect(keepAlive).not.toHaveBeenCalled();
  });

  it('stops listening and ticking once stopped', () => {
    vi.useFakeTimers();
    const keepAlive = vi.fn();
    const environment = createEnvironment();
    const stop = startSessionKeepAlive(keepAlive, environment);

    stop();
    environment.focus();
    vi.advanceTimersByTime(SESSION_KEEPALIVE_TICK_MS * 2);

    expect(keepAlive).not.toHaveBeenCalled();
    expect(environment.focusListeners.size).toBe(0);
  });
});
