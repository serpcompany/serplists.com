import { describe, expect, it } from 'vitest';

import type { SessionCheck } from '@/contexts/authSession';
import { SESSION_RECHECK_INTERVAL_MS } from '@/contexts/sessionSync';
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

describe('session sync across tabs, which share one session cookie', () => {
  it('switches a tab signed in as Alice to Bob when another tab signs in as Bob, while the announcing tab reads nothing', async () => {
    const { tab1, tab2 } = twoTabsOnOneChannel(bob, { state: signedInAs(alice), answers: [signedInCheck(bob)] });

    tab2.sync.announce(bob.id);
    await flush();

    expect(tab1.readSession).toHaveBeenCalledTimes(1);
    expect(tab1.state()).toMatchObject({ user: bob, status: 'authenticated' });
    expect(tab1.notify).toHaveBeenCalledWith(expect.stringContaining(bob.email));
    expect(tab2.readSession).not.toHaveBeenCalled();
  });

  it('signs a tab out when another tab signs out', async () => {
    const { tab1, tab2 } = twoTabsOnOneChannel(alice, { state: signedInAs(alice), answers: [{ kind: 'unauthenticated' }] });

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
    const { tab1, tab2 } = twoTabsOnOneChannel(bob, { state: signedInAs(alice), answers: [{ kind: 'unknown', status: 503 }, signedInCheck(alice)] });
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
    const pending: Array<(check: SessionCheck) => void> = [];
    const { tab1, tab2 } = twoTabsOnOneChannel(bob, {
      state: signedInAs(alice),
      readSession: () => new Promise<SessionCheck>((resolve) => pending.push(resolve)),
    });

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
    const { tab1, tab2 } = twoTabsOnOneChannel(bob, { state: signedInAs(alice), answers: [signedInCheck(bob)] });

    const pageLoadCheckStillOut = tab1.sync.beginRead();
    tab2.sync.announce(bob.id);
    await flush();

    expect(tab1.state().user).toEqual(bob);
    expect(tab1.sync.acceptRead(pageLoadCheckStillOut)).toBe(false);
  });

  it('does not let a failed re-check drop an older answer that is still coming', async () => {
    const { tab1, tab2 } = twoTabsOnOneChannel(bob, { state: { user: null, session: null, status: 'unavailable' }, answers: [{ kind: 'unknown' }] });

    const retry = tab1.sync.beginRead();
    tab2.sync.announce(bob.id);
    await flush();

    expect(tab1.readSession).toHaveBeenCalledTimes(1);
    expect(tab1.sync.acceptRead(retry)).toBe(true);
  });

  it('lets a sign-in or sign-out in this tab win over a check still in flight', async () => {
    let resolveCheck: (check: SessionCheck) => void = () => {};
    const { tab1, tab2 } = twoTabsOnOneChannel(bob, {
      state: signedInAs(alice),
      readSession: () => new Promise<SessionCheck>((resolve) => { resolveCheck = resolve; }),
    });

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
    const { hub, tab1, tab2, disconnectTab1 } = twoTabsOnOneChannel(bob, { state: signedInAs(alice), answers: [signedInCheck(bob)] });

    disconnectTab1();
    tab2.sync.announce(bob.id);
    tab1.showTab();
    await flush();

    expect(hub.channels.size).toBe(1);
    expect(tab1.readSession).not.toHaveBeenCalled();
  });
});
