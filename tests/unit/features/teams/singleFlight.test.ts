import { describe, expect, it, vi } from 'vitest';

import { createSingleFlight } from '@/features/teams/singleFlight';

describe('createSingleFlight', () => {
  it('ignores a second call while the first is running, so a double click sends one request', async () => {
    const runOnce = createSingleFlight();
    let finish: (value: string) => void = () => undefined;
    const accept = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; }));

    const first = runOnce(accept);
    const second = runOnce(accept);
    finish('accepted');

    await expect(first).resolves.toBe('accepted');
    await expect(second).resolves.toBeUndefined();
    expect(accept).toHaveBeenCalledTimes(1);
  });

  it('runs again after the previous call settles, including after a failure', async () => {
    const runOnce = createSingleFlight();
    const task = vi.fn()
      .mockRejectedValueOnce(new Error('Invite expired'))
      .mockResolvedValueOnce('accepted');

    await expect(runOnce(task)).rejects.toThrow('Invite expired');
    await expect(runOnce(task)).resolves.toBe('accepted');
    expect(task).toHaveBeenCalledTimes(2);
  });
});
