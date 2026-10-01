import { describe, expect, it, vi } from 'vitest';

import { createApiError } from '@/lib/api-errors';
import { loadRunExecutionData } from '@/features/run-execution/runExecutionLoad';

import { buildRun, runExecutionApiClient } from '../../../fixtures/runExecutionFixtures';

describe('run execution model loading', () => {
  it('loads a private run from cache before hitting the API', async () => {
    const cachedRun = buildRun();
    const apiClient = runExecutionApiClient();

    const result = await loadRunExecutionData(
      {
        getCachedRun: () => cachedRun,
        runId: 'run-1',
      },
      { apiClient, updateRun: vi.fn() },
    );

    expect(result).toEqual({
      kind: 'ok',
      mode: 'private',
      run: cachedRun,
      selectedItemId: 'item-1',
    });
    expect(apiClient.getChecklistById).not.toHaveBeenCalled();
  });

  it('loads a shared run by share token and normalizes legacy items', async () => {
    const apiClient = {
      ...runExecutionApiClient(),
      getSharedChecklist: vi.fn().mockResolvedValue({
        id: 'shared-run',
        template_id: 'template-1',
        title: 'Shared checklist',
        items: JSON.stringify([
          { id: 'item-1', title: 'First item', completed: true },
          { id: 'item-2', title: 'Second item' },
        ]),
        status: 'in_progress',
        started_at: '2026-04-18T00:00:00.000Z',
        user_id: 'user-2',
        is_public: true,
      }),
    };

    const result = await loadRunExecutionData(
      {
        shareToken: 'share-token',
      },
      { apiClient, updateRun: vi.fn() },
    );

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') {
      throw new Error('expected ok result');
    }

    expect(result.mode).toBe('shared');
    expect(result.run.isPublic).toBe(true);
    expect(result.selectedItemId).toBe('item-2');
    expect(result.run.sections).toEqual([
      {
        id: '1',
        title: 'Checklist',
        items: [
          {
            id: 'item-1',
            title: 'First item',
            isCompleted: true,
            contents: undefined,
          },
          {
            id: 'item-2',
            title: 'Second item',
            isCompleted: false,
            contents: undefined,
          },
        ],
      },
    ]);
    expect(apiClient.getSharedChecklist).toHaveBeenCalledWith('share-token');
  });

  it('returns an error result instead of not_found for transient load failures', async () => {
    const apiClient = {
      ...runExecutionApiClient(),
      getChecklistById: vi.fn().mockRejectedValue(new Error('Network down')),
    };

    const result = await loadRunExecutionData(
      {
        runId: 'run-1',
      },
      { apiClient, updateRun: vi.fn() },
    );

    expect(result).toEqual({
      kind: 'error',
      message: 'Network down',
      mode: 'private',
    });
  });

  it('keeps 404 responses as not_found results', async () => {
    const apiClient = {
      ...runExecutionApiClient(),
      getChecklistById: vi.fn().mockRejectedValue(createApiError(404, { error: 'Run missing' })),
    };

    const result = await loadRunExecutionData(
      {
        runId: 'run-1',
      },
      { apiClient, updateRun: vi.fn() },
    );

    expect(result).toEqual({
      kind: 'not_found',
      mode: 'private',
    });
  });
});
