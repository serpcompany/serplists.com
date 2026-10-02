import { describe, expect, it } from 'vitest';

import { createSaveQueue } from '@/features/run-execution/saveQueue';

import { deferred } from '../../../support/deferred';

describe('createSaveQueue', () => {
  it('ignores a key that is already pending, like a double click', async () => {
    const queue = createSaveQueue();
    const save = deferred<string>();
    let calls = 0;
    const first = queue('toggle:a', () => { calls += 1; return save.promise; });
    const second = queue('toggle:a', () => { calls += 1; return save.promise; });

    expect(await second).toBeNull();
    save.resolve('saved');
    expect(await first).toBe('saved');
    expect(calls).toBe(1);
    expect(await queue('toggle:a', async () => 'again')).toBe('again');
  });

  it('runs different saves one at a time, in order', async () => {
    const queue = createSaveQueue();
    const order: string[] = [];
    const firstSave = deferred<string>();
    const first = queue('toggle:a', async () => { order.push('a:start'); const value = await firstSave.promise; order.push('a:end'); return value; });
    const second = queue('notes:a', async () => { order.push('b:start'); return 'b'; });

    await Promise.resolve();
    expect(order).toEqual(['a:start']);
    firstSave.resolve('a');
    await Promise.all([first, second]);
    expect(order).toEqual(['a:start', 'a:end', 'b:start']);
  });

  it('keeps running after a save fails', async () => {
    const queue = createSaveQueue();
    const failed = queue('toggle:a', async () => { throw new Error('network'); });
    await expect(failed).rejects.toThrow('network');
    expect(await queue('toggle:a', async () => 'recovered')).toBe('recovered');
  });
});
