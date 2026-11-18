import '../../../support/mockedToasts';
import '../../../support/cleanupAfterEachTest';
import { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';

import { RunShareActions } from '@/components/run-execution/RunShareActions';
import type { RunExecutionActionResult } from '@/features/run-execution/runExecutionResult';

import { deferred } from '../../../support/deferred';
import { renderSettled } from '../../../support/renderInTheDom';

const renderTheActions = (onStopSharing: () => Promise<RunExecutionActionResult>, isCreatingShare = false) =>
  renderSettled(
    <RunShareActions isCreatingShare={isCreatingShare} isPublic onShare={vi.fn()} onStopSharing={onStopSharing} />,
  );

const stopSharing = () =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
  });

describe('Stop sharing on a shared run', () => {
  it('locks both buttons while it stops, then says the old link no longer works', async () => {
    const reply = deferred<RunExecutionActionResult>();
    await renderTheActions(() => reply.promise);

    await stopSharing();
    expect(screen.getByRole('button', { name: 'Stopping...' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Share' })).toHaveProperty('disabled', true);

    await act(async () => {
      reply.resolve({ kind: 'ok' });
      await reply.promise;
    });

    expect(toast.success).toHaveBeenCalledWith('Sharing stopped. The old link no longer works.');
    expect(screen.getByRole('button', { name: 'Stop sharing' })).toHaveProperty('disabled', false);
  });

  it("shows the API's reason when it refuses, or a general one when it gives none", async () => {
    const onStopSharing = vi
      .fn<() => Promise<RunExecutionActionResult>>()
      .mockResolvedValueOnce({ kind: 'error', message: 'Only the run owner can stop sharing.' })
      .mockResolvedValueOnce({ kind: 'error', message: '' });
    await renderTheActions(onStopSharing);

    await stopSharing();
    await stopSharing();

    expect(vi.mocked(toast.error).mock.calls).toEqual([
      ['Only the run owner can stop sharing.'],
      ['Unable to stop sharing this run.'],
    ]);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('says nothing when the request was dropped', async () => {
    await renderTheActions(async () => ({ kind: 'ignored' }));

    await stopSharing();

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows the message of a request that failed, or a general one', async () => {
    const onStopSharing = vi
      .fn<() => Promise<RunExecutionActionResult>>()
      .mockRejectedValueOnce(new Error('Network down'))
      .mockRejectedValueOnce('offline');
    await renderTheActions(onStopSharing);

    await stopSharing();
    await stopSharing();

    expect(vi.mocked(toast.error).mock.calls).toEqual([['Network down'], ['Unable to stop sharing this run.']]);
    expect(screen.getByRole('button', { name: 'Stop sharing' })).toHaveProperty('disabled', false);
  });

  it('says Creating link... on Share while a share link is made', async () => {
    await renderTheActions(async () => ({ kind: 'ok' }), true);

    expect(screen.getByRole('button', { name: 'Creating link...' })).toHaveProperty('disabled', true);
  });
});
