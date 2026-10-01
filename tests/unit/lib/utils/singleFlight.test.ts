import { describe, expect, it, vi } from 'vitest';

import { createSingleFlight } from '@/lib/utils/singleFlight';

import { deferred } from '../../../support/deferred';

describe('createSingleFlight', () => {
  it('runs the task once when it is called twice in one tick, before React could disable the button', async () => {
    const onRunningChange = vi.fn();
    const flight = createSingleFlight(onRunningChange);
    const pending = deferred<string>();
    const task = vi.fn(() => pending.promise);

    const firstClick = flight.run(task);
    const secondClickInTheSameTick = flight.run(task);

    expect(task).toHaveBeenCalledTimes(1);
    expect(flight.isRunning()).toBe(true);
    await expect(secondClickInTheSameTick).resolves.toBeUndefined();

    pending.resolve('done');
    await expect(firstClick).resolves.toBe('done');
    expect(flight.isRunning()).toBe(false);
    expect(onRunningChange.mock.calls).toEqual([[true], [false]]);
  });

  it('runs again after the previous task fails', async () => {
    const onRunningChange = vi.fn();
    const flight = createSingleFlight(onRunningChange);
    const pending = deferred<string>();

    const first = flight.run(() => pending.promise);
    pending.reject(new Error('HTTP 500'));
    await expect(first).rejects.toThrow('HTTP 500');

    expect(flight.isRunning()).toBe(false);
    const task = vi.fn().mockResolvedValue('retried');
    await expect(flight.run(task)).resolves.toBe('retried');
    expect(task).toHaveBeenCalledTimes(1);
    expect(onRunningChange.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  it('releases the guard when the task throws before it awaits anything', async () => {
    const flight = createSingleFlight();

    await expect(
      flight.run(() => {
        throw new Error('sync failure');
      }),
    ).rejects.toThrow('sync failure');

    expect(flight.isRunning()).toBe(false);
  });

  it('releases the guard when the task returns early', async () => {
    const flight = createSingleFlight();

    await flight.run(async () => undefined);
    const task = vi.fn().mockResolvedValue('next');

    await expect(flight.run(task)).resolves.toBe('next');
    expect(task).toHaveBeenCalledTimes(1);
  });
});
