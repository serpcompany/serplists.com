import { afterEach, describe, expect, it, vi } from 'vitest';

import { memoryStorage } from '../../fixtures/memoryStorage';
import { browserSessionSyncEnvironment, SESSION_KEEPALIVE_TICK_MS, startSessionKeepAlive } from '@/contexts/sessionSync';

const showThePage = (visibilityState: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: visibilityState });
  document.dispatchEvent(new Event('visibilitychange'));
};

const showFromTheBackForwardCache = (persisted: boolean) =>
  window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted }));

const anotherTabWrites = (key: string, newValue: string) =>
  window.dispatchEvent(new StorageEvent('storage', { key, newValue }));

const openOtherTabs: BroadcastChannel[] = [];

afterEach(() => {
  openOtherTabs.splice(0).forEach((channel) => channel.close());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the browser's session sync environment", () => {
  it('hears and reaches the other tabs over a BroadcastChannel, until it is closed', async () => {
    const otherTab = new BroadcastChannel('serplists-auth');
    openOtherTabs.push(otherTab);
    const heardByTheOtherTab = new Promise((resolve) => {
      otherTab.onmessage = (event: MessageEvent<unknown>) => resolve(event.data);
    });
    const channel = browserSessionSyncEnvironment().openChannel();
    if (!channel) throw new Error('No BroadcastChannel was opened');
    const heard: unknown[] = [];
    const heardFromTheOtherTab = new Promise((resolve) => {
      channel.onMessage((data) => {
        heard.push(data);
        resolve(data);
      });
    });

    channel.postMessage({ userId: 'user-1' });
    otherTab.postMessage({ userId: null });

    await expect(heardByTheOtherTab).resolves.toEqual({ userId: 'user-1' });
    await expect(heardFromTheOtherTab).resolves.toEqual({ userId: null });
    channel.close();
    otherTab.postMessage({ userId: 'user-2' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(heard).toEqual([{ userId: null }]);
  });

  it('opens no channel in a browser without BroadcastChannel', () => {
    vi.stubGlobal('BroadcastChannel', undefined);

    expect(browserSessionSyncEnvironment().openChannel()).toBeNull();
  });

  it('writes to local storage and hears the storage events other tabs cause, until stopped', () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const environment = browserSessionSyncEnvironment();
    const heard: [string | null, string | null][] = [];

    environment.writeStorage('serplists.sessionChanged', '{"userId":null}');
    const stop = environment.onStorage((key, value) => heard.push([key, value]));
    anotherTabWrites('serplists.sessionChanged', '{"userId":"user-1"}');
    stop();
    anotherTabWrites('serplists.sessionChanged', '{"userId":"user-2"}');

    expect(storage.items).toEqual(new Map([['serplists.sessionChanged', '{"userId":null}']]));
    expect(heard).toEqual([['serplists.sessionChanged', '{"userId":"user-1"}']]);
  });

  it('tells when the page becomes visible, not when it is hidden, until stopped', () => {
    const shown = vi.fn();
    const stop = browserSessionSyncEnvironment().onVisible(shown);

    showThePage('hidden');
    showThePage('visible');
    stop();
    showThePage('visible');

    expect(shown).toHaveBeenCalledTimes(1);
  });

  it('tells when the page comes back from the back/forward cache, not on an ordinary load, until stopped', () => {
    const restored = vi.fn();
    const stop = browserSessionSyncEnvironment().onRestored(restored);

    showFromTheBackForwardCache(false);
    showFromTheBackForwardCache(true);
    stop();
    showFromTheBackForwardCache(true);

    expect(restored).toHaveBeenCalledTimes(1);
  });
});

describe("the session keep-alive in the browser's window", () => {
  it('asks when the window gains focus while visible, not while hidden, and stops listening once stopped', () => {
    vi.useFakeTimers();
    const keepAlive = vi.fn();
    const stop = startSessionKeepAlive(keepAlive);

    showThePage('visible');
    window.dispatchEvent(new Event('focus'));
    showThePage('hidden');
    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(SESSION_KEEPALIVE_TICK_MS);
    expect(keepAlive).toHaveBeenCalledTimes(1);

    showThePage('visible');
    stop();
    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(SESSION_KEEPALIVE_TICK_MS);
    expect(keepAlive).toHaveBeenCalledTimes(1);
  });
});
