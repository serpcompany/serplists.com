import { describe, expect, it, vi } from 'vitest';

import { createApiError } from '@/lib/api-errors';

import { createRunExecutionShare, stopRunExecutionSharing } from '@/features/run-execution/runSharing';

import { buildRun, runExecutionApiClient } from '../../../fixtures/runExecutionFixtures';
import { objectContaining } from '../../../support/asymmetricMatchers';

describe('sharing from the run page tells the cached runs list, which would otherwise keep offering a Revalidate the API refuses for a shared run', () => {
  const apiClient = (createChecklistRunShare: ReturnType<typeof vi.fn>) => ({
    ...runExecutionApiClient(),
    createChecklistRunShare,
  });

  it('reports the shared run and marks the run on the page public, at the same revision', async () => {
    const onShared = vi.fn();
    const client = apiClient(vi.fn().mockResolvedValue({ shareToken: 'token-1' }));

    const result = await createRunExecutionShare(
      { run: buildRun({ isPublic: false, revision: 4 }) },
      { apiClient: client, onShared, origin: 'https://serplists.com', updateRun: vi.fn() },
    );

    expect(result).toMatchObject({ kind: 'ok', shareUrl: 'https://serplists.com/share/token-1/' });
    expect(result.kind === 'ok' ? result.run : undefined).toMatchObject({ id: 'run-1', isPublic: true, revision: 4 });
    expect(onShared).toHaveBeenCalledWith('run-1');
  });

  it('reports nothing when the share fails', async () => {
    const onShared = vi.fn();
    const client = apiClient(vi.fn().mockRejectedValue(new Error('Run not found')));

    const result = await createRunExecutionShare({ run: buildRun() }, { apiClient: client, onShared, updateRun: vi.fn() });

    expect(result.kind).toBe('error');
    expect(onShared).not.toHaveBeenCalled();
  });
});

describe('run page sharing', () => {
  const sharingApiClient = () => ({
    ...runExecutionApiClient(),
    createChecklistRunShare: vi.fn().mockResolvedValue({ shareToken: 'token-1' }),
    revokeChecklistRunShare: vi.fn().mockResolvedValue({ id: 'run-1', isPublic: false }),
  });

  it('marks the run shared and refreshes the runs list after sharing', async () => {
    const apiClient = sharingApiClient();
    const markRunSharedInTheCachedLists = vi.fn();

    const result = await createRunExecutionShare(
      { run: buildRun({ isPublic: false }) },
      { apiClient, onShared: markRunSharedInTheCachedLists, origin: 'https://app.test', updateRun: vi.fn() },
    );

    expect(result).toEqual({
      kind: 'ok',
      run: objectContaining({ id: 'run-1', isPublic: true }),
      shareUrl: 'https://app.test/share/token-1/',
    });
    expect(markRunSharedInTheCachedLists).toHaveBeenCalledWith('run-1');
  });

  it('stops sharing through the API, marks the run private at the same revision so later saves keep working, and refreshes the runs list', async () => {
    const apiClient = sharingApiClient();
    const refreshRuns = vi.fn();
    const run = buildRun({ isPublic: true, revision: 4 });

    const result = await stopRunExecutionSharing({ run }, { apiClient, refreshRuns, updateRun: vi.fn() });

    expect(apiClient.revokeChecklistRunShare).toHaveBeenCalledWith('run-1');
    expect(result).toEqual({ kind: 'ok', run: { ...run, isPublic: false } });
    expect(refreshRuns).toHaveBeenCalledTimes(1);
  });

  it('returns the API error and keeps the run shared when stopping fails', async () => {
    const apiClient = sharingApiClient();
    apiClient.revokeChecklistRunShare.mockRejectedValue(createApiError(403, { error: 'Forbidden' }));
    const refreshRuns = vi.fn();

    const result = await stopRunExecutionSharing(
      { run: buildRun({ isPublic: true }) },
      { apiClient, refreshRuns, updateRun: vi.fn() },
    );

    expect(result).toEqual({ kind: 'error', message: 'Forbidden' });
    expect(refreshRuns).not.toHaveBeenCalled();
  });

  it('never stops sharing from a share link or without a loaded run', async () => {
    const apiClient = sharingApiClient();

    expect(await stopRunExecutionSharing(
      { run: buildRun({ isPublic: true }), shareToken: 'token-1' },
      { apiClient, updateRun: vi.fn() },
    )).toEqual({ kind: 'shared_disabled' });
    expect(await stopRunExecutionSharing({}, { apiClient, updateRun: vi.fn() })).toEqual({ kind: 'not_found' });
    expect(apiClient.revokeChecklistRunShare).not.toHaveBeenCalled();
  });
});
