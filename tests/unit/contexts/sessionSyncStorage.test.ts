import { describe, expect, it } from 'vitest';

import { SESSION_SYNC_STORAGE_KEY, createSessionSync, type SessionSyncEnvironment } from '@/contexts/sessionSync';

const stopNothing = () => () => undefined;

describe('session sync over storage events', () => {
  it('writes a new value for every announcement, since the browser fires a storage event only when the value changes', () => {
    let now = 1_000;
    const writes: Array<{ key: string; value: string }> = [];
    const sync = createSessionSync({
      readSession: async () => ({ kind: 'unknown' }),
      initialState: { user: null, session: null, status: 'unauthenticated' },
      setState: () => undefined,
      notify: () => undefined,
      now: () => now,
    });
    const storageOnly: SessionSyncEnvironment = {
      openChannel: () => null,
      writeStorage: (key, value) => writes.push({ key, value }),
      onStorage: stopNothing,
      onVisible: stopNothing,
      onRestored: stopNothing,
      onUnauthorized: stopNothing,
    };
    sync.connect(storageOnly);

    sync.announce('user-1');
    now += 1;
    sync.announce('user-1');

    expect(writes.map(({ key }) => key)).toEqual([SESSION_SYNC_STORAGE_KEY, SESSION_SYNC_STORAGE_KEY]);
    expect(writes[0]?.value).not.toBe(writes[1]?.value);
  });
});
