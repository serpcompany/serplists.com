import { vi } from 'vitest';

import type { SessionCheck, SessionState } from '@/contexts/authSession';
import { createSessionSync, type SessionSyncChannel, type SessionSyncEnvironment } from '@/contexts/sessionSync';

export const alice = { id: 'user-alice', email: 'alice@example.com' };
export const bob = { id: 'user-bob', email: 'bob@example.com' };
export const signedInAs = (user: typeof alice): SessionState => ({ user, session: { user }, status: 'authenticated' });
export const signedInCheck = (user: typeof alice): SessionCheck => ({ kind: 'authenticated', user, session: { user } });

export function createBroadcastChannelHub() {
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

export function createStorageEventHub() {
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

export function createTab(options: {
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

export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

export function twoTabsOnOneChannel(secondTabUser: typeof alice, firstTab: Parameters<typeof createTab>[0]) {
  const hub = createBroadcastChannelHub();
  const tab1 = createTab(firstTab);
  const tab2 = createTab({ state: signedInAs(secondTabUser) });
  const disconnectTab1 = tab1.sync.connect(tab1.environment({ openChannel: hub.open }));
  tab2.sync.connect(tab2.environment({ openChannel: hub.open }));
  return { hub, tab1, tab2, disconnectTab1 };
}
