import { describe, expect, it, vi } from 'vitest';

import { runTeamWrite } from '@/features/teams/runTeamWrite';

// A committed Organization change must not be reported as failed because the
// refresh that follows it failed.

const handlers = () => ({
  onSaved: vi.fn(),
  onRefreshFailed: vi.fn(),
  onWriteFailed: vi.fn(),
});

describe('runTeamWrite', () => {
  it('reports a committed write as saved when refreshing the Organization list fails', async () => {
    const calls = handlers();
    const reloadMembers = vi.fn().mockResolvedValue(undefined);
    const refreshTeams = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    const reloadActivity = vi.fn().mockResolvedValue(undefined);

    await expect(
      runTeamWrite({
        write: vi.fn().mockResolvedValue({ success: true }),
        refreshes: [reloadMembers, refreshTeams, reloadActivity],
        ...calls,
      }),
    ).resolves.toBe(true);

    expect(calls.onSaved).toHaveBeenCalledWith({ success: true });
    expect(calls.onWriteFailed).not.toHaveBeenCalled();
    expect(calls.onRefreshFailed).toHaveBeenCalledTimes(1);
    // One failed refresh does not skip the others.
    expect(reloadMembers).toHaveBeenCalledTimes(1);
    expect(reloadActivity).toHaveBeenCalledTimes(1);
  });

  it('reports saved before the refreshes finish', async () => {
    const calls = handlers();
    let finishRefresh: () => void = () => undefined;
    const refresh = vi.fn(() => new Promise<void>((resolve) => { finishRefresh = resolve; }));

    const running = runTeamWrite({ write: async () => 'ok', refreshes: [refresh], ...calls });
    await vi.waitFor(() => expect(calls.onSaved).toHaveBeenCalledWith('ok'));
    finishRefresh();
    await running;

    expect(calls.onRefreshFailed).not.toHaveBeenCalled();
  });

  it('treats a refresh that throws synchronously as a failed refresh', async () => {
    const calls = handlers();

    await runTeamWrite({
      write: async () => 'ok',
      refreshes: [
        () => {
          throw new Error('boom');
        },
      ],
      ...calls,
    });

    expect(calls.onSaved).toHaveBeenCalledTimes(1);
    expect(calls.onRefreshFailed).toHaveBeenCalledTimes(1);
  });

  it('reports only the write error and skips the refreshes when the write fails', async () => {
    const calls = handlers();
    const refresh = vi.fn();
    const error = new Error('Only the Organization owner can transfer ownership');

    await expect(
      runTeamWrite({ write: vi.fn().mockRejectedValue(error), refreshes: [refresh], ...calls }),
    ).resolves.toBe(false);

    expect(calls.onWriteFailed).toHaveBeenCalledWith(error);
    expect(calls.onSaved).not.toHaveBeenCalled();
    expect(calls.onRefreshFailed).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
