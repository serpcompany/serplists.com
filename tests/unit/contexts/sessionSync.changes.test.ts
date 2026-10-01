import { describe, expect, it, vi } from 'vitest';

import type { SessionCheck, SessionState } from '@/contexts/authSession';
import { SESSION_KEEPALIVE_INTERVAL_MS, applySessionRecheck } from '@/contexts/sessionSync';
import {
  alice,
  bob,
  createBroadcastChannelHub,
  createStorageEventHub,
  createTab,
  flush,
  signedInAs,
  signedInCheck,
  twoTabsOnOneChannel,
} from '../../support/sessionSyncTabs';

describe('keeping unsaved work before a background session change, while the tab still shows the user who typed it', () => {
  it("runs before another tab's sign-out signs this tab out", async () => {
    const beforeSessionLost = vi.fn();
    const { tab1, tab2 } = twoTabsOnOneChannel(alice, { state: signedInAs(alice), answers: [{ kind: 'unauthenticated' }], beforeSessionLost });

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
    const beforeSessionLost = vi.fn();
    const { tab1, tab2 } = twoTabsOnOneChannel(bob, { state: signedInAs(alice), answers: [signedInCheck(bob)], beforeSessionLost });

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
    const beforeSessionLost = vi.fn();
    const { tab1, tab2 } = twoTabsOnOneChannel(bob, {
      state: signedInAs(alice),
      readSession: () => new Promise<SessionCheck>((resolve) => { resolveCheck = resolve; }),
      beforeSessionLost,
    });

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
