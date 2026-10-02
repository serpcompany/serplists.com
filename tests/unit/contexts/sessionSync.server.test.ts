import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SessionCheck } from '@/contexts/authSession';
import {
  SESSION_KEEPALIVE_INTERVAL_MS,
  SESSION_KEEPALIVE_TICK_MS,
  SESSION_UNAUTHORIZED_RECHECK_INTERVAL_MS,
  startSessionKeepAlive,
} from '@/contexts/sessionSync';
import { alice, createTab, flush, signedInAs, signedInCheck } from '../../support/sessionSyncTabs';

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
