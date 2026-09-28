import { describe, expect, it, vi } from 'vitest';

import { createApiError } from '@/lib/api-errors';
import type { ChecklistRun } from '@/types/checklist';

import {
  createRunExecutionShare,
  loadRunExecutionData,
  saveRunItemNotes,
  stopRunExecutionSharing,
  toggleRunItem,
  toggleRunSubItem,
} from '@/features/run-execution/useRunExecutionModel';

const buildRun = (overrides: Partial<ChecklistRun> = {}): ChecklistRun => ({
  id: 'run-1',
  templateId: 'template-1',
  title: 'Launch checklist',
  status: 'in_progress',
  progress: 0,
  sections: [
    {
      id: 'section-1',
      title: 'Checklist',
      items: [
        {
          id: 'item-1',
          title: 'First item',
          isCompleted: false,
          contents: [
            {
              type: 'subItems',
              value: '',
              subItems: [
                { id: 'sub-1', title: 'Sub item 1', isCompleted: false },
                { id: 'sub-2', title: 'Sub item 2', isCompleted: false },
              ],
            },
          ],
        },
        {
          id: 'item-2',
          title: 'Second item',
          isCompleted: true,
          contents: [],
        },
      ],
    },
  ],
  startedAt: '2026-04-18T00:00:00.000Z',
  userId: 'user-1',
  templateVersion: 1,
  revision: 1,
  ...overrides,
});

describe('run execution model loading', () => {
  it('loads a private run from cache before hitting the API', async () => {
    const cachedRun = buildRun();
    const apiClient = {
      createChecklistRunShare: vi.fn(),
      getChecklistById: vi.fn(),
      getSharedChecklist: vi.fn(),
      updateChecklist: vi.fn(),
      updateSharedChecklist: vi.fn(),
    };

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
      createChecklistRunShare: vi.fn(),
      getChecklistById: vi.fn(),
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
      updateChecklist: vi.fn(),
      updateSharedChecklist: vi.fn(),
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
      createChecklistRunShare: vi.fn(),
      getChecklistById: vi.fn().mockRejectedValue(new Error('Network down')),
      getSharedChecklist: vi.fn(),
      updateChecklist: vi.fn(),
      updateSharedChecklist: vi.fn(),
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
      createChecklistRunShare: vi.fn(),
      getChecklistById: vi
        .fn()
        .mockRejectedValue(createApiError(404, { error: 'Run missing' })),
      getSharedChecklist: vi.fn(),
      updateChecklist: vi.fn(),
      updateSharedChecklist: vi.fn(),
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

describe('run execution model actions', () => {
  it('persists task notes on the run without changing the template', async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => ({ ...run, revision: 2 }));
    const run = buildRun();

    const result = await saveRunItemNotes(
      { itemId: 'item-1', notes: 'Sent email: https://example.com/message/42', run },
      {
        apiClient: {
          createChecklistRunShare: vi.fn(),
          getChecklistById: vi.fn(),
          getSharedChecklist: vi.fn(),
          updateSharedChecklist: vi.fn(),
        },
        updateRun,
      },
    );

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok result');
    expect(result.run?.sections[0]?.items[0]?.notes).toBe(
      'Sent email: https://example.com/message/42',
    );
    expect(run.sections[0]?.items[0]?.notes).toBeUndefined();
    expect(updateRun).toHaveBeenCalledOnce();
    expect(result.run?.revision).toBe(2);
  });

  it('toggling an item updates its sub-items and persists private runs', async () => {
    const updateRun = vi.fn();
    const apiClient = {
      createChecklistRunShare: vi.fn(),
      getChecklistById: vi.fn(),
      getSharedChecklist: vi.fn(),
      updateChecklist: vi.fn(),
      updateSharedChecklist: vi.fn(),
    };

    const result = await toggleRunItem(
      {
        itemId: 'item-1',
        run: buildRun(),
      },
      { apiClient, updateRun },
    );

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') {
      throw new Error('expected ok result');
    }

    const subItems =
      result.run.sections[0]?.items[0]?.contents?.[0]?.type === 'subItems'
        ? result.run.sections[0].items[0].contents[0].subItems
        : [];

    expect(result.shouldPromptComplete).toBe(true);
    expect(result.run.sections[0]?.items[0]?.isCompleted).toBe(true);
    expect(subItems).toEqual([
      { id: 'sub-1', title: 'Sub item 1', isCompleted: true },
      { id: 'sub-2', title: 'Sub item 2', isCompleted: true },
    ]);
    expect(updateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'run-1',
        progress: 100,
      }),
    );
    expect(apiClient.updateSharedChecklist).not.toHaveBeenCalled();
  });

  it('toggling sub-items updates the parent item and persists shared runs', async () => {
    const apiClient = {
      createChecklistRunShare: vi.fn(),
      getChecklistById: vi.fn(),
      getSharedChecklist: vi.fn(),
      updateChecklist: vi.fn(),
      updateSharedChecklist: vi.fn(),
    };

    const firstToggle = await toggleRunSubItem(
      {
        contentIndex: 0,
        itemId: 'item-1',
        run: buildRun(),
        shareToken: 'share-token',
        subItemIndex: 0,
      },
      { apiClient, updateRun: vi.fn() },
    );

    expect(firstToggle.kind).toBe('ok');
    if (firstToggle.kind !== 'ok') {
      throw new Error('expected ok result');
    }
    expect(firstToggle.run.sections[0]?.items[0]?.isCompleted).toBe(false);

    const secondToggle = await toggleRunSubItem(
      {
        contentIndex: 0,
        itemId: 'item-1',
        run: firstToggle.run,
        shareToken: 'share-token',
        subItemIndex: 1,
      },
      { apiClient, updateRun: vi.fn() },
    );

    expect(secondToggle.kind).toBe('ok');
    if (secondToggle.kind !== 'ok') {
      throw new Error('expected ok result');
    }

    expect(secondToggle.run.sections[0]?.items[0]?.isCompleted).toBe(true);
    expect(secondToggle.shouldPromptComplete).toBe(true);
    expect(apiClient.updateSharedChecklist).toHaveBeenLastCalledWith(
      'share-token',
      expect.objectContaining({
        progress: 100,
        status: 'in_progress',
      }),
    );
  });

  it('blocks share creation in shared mode', async () => {
    const apiClient = {
      createChecklistRunShare: vi.fn(),
      getChecklistById: vi.fn(),
      getSharedChecklist: vi.fn(),
      updateChecklist: vi.fn(),
      updateSharedChecklist: vi.fn(),
    };

    const result = await createRunExecutionShare(
      {
        run: buildRun(),
        shareToken: 'share-token',
      },
      { apiClient, updateRun: vi.fn() },
    );

    expect(result).toEqual({ kind: 'shared_disabled' });
    expect(apiClient.createChecklistRunShare).not.toHaveBeenCalled();
  });

  it('returns not_found when share creation is requested without a loaded run', async () => {
    const apiClient = {
      createChecklistRunShare: vi.fn(),
      getChecklistById: vi.fn(),
      getSharedChecklist: vi.fn(),
      updateChecklist: vi.fn(),
      updateSharedChecklist: vi.fn(),
    };

    const result = await createRunExecutionShare(
      {},
      { apiClient, updateRun: vi.fn() },
    );

    expect(result).toEqual({ kind: 'not_found' });
    expect(apiClient.createChecklistRunShare).not.toHaveBeenCalled();
  });
});

describe('Sub-tasks in more than one block', () => {
  it('keeps the task open while another Sub-tasks block has an unfinished Sub-task', async () => {
    const run = buildRun();
    run.sections[0].items[0].contents = [
      { type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Short', isCompleted: false }] },
      { type: 'subItems', value: '', subItems: [{ id: 'sub-2', title: 'Tagline', isCompleted: false }] },
    ];
    const apiClient = {
      createChecklistRunShare: vi.fn(),
      getChecklistById: vi.fn(),
      getSharedChecklist: vi.fn(),
      updateChecklist: vi.fn(),
      updateSharedChecklist: vi.fn(),
    };

    const result = await toggleRunSubItem(
      { contentIndex: 0, itemId: 'item-1', run, shareToken: 'share-token', subItemIndex: 0 },
      { apiClient, updateRun: vi.fn() },
    );

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok result');
    expect(result.run.sections[0]?.items[0]?.isCompleted).toBe(false);
    expect(result.shouldPromptComplete).toBe(false);
  });
});

describe('run page sharing', () => {
  const sharingApiClient = () => ({
    createChecklistRunShare: vi.fn().mockResolvedValue({ shareToken: 'token-1' }),
    getChecklistById: vi.fn(),
    getSharedChecklist: vi.fn(),
    revokeChecklistRunShare: vi.fn().mockResolvedValue({ id: 'run-1', isPublic: false }),
    updateSharedChecklist: vi.fn(),
  });

  it('marks the run shared and refreshes the runs list after sharing', async () => {
    const apiClient = sharingApiClient();
    const refreshRuns = vi.fn();

    const result = await createRunExecutionShare(
      { run: buildRun({ isPublic: false }) },
      { apiClient, origin: 'https://app.test', refreshRuns, updateRun: vi.fn() },
    );

    expect(result).toEqual({
      kind: 'ok',
      run: expect.objectContaining({ id: 'run-1', isPublic: true }),
      shareUrl: 'https://app.test/share/token-1',
    });
    expect(refreshRuns).toHaveBeenCalledTimes(1);
  });

  it('stops sharing through the API, marks the run private and refreshes the runs list', async () => {
    const apiClient = sharingApiClient();
    const refreshRuns = vi.fn();
    const run = buildRun({ isPublic: true, revision: 4 });

    const result = await stopRunExecutionSharing({ run }, { apiClient, refreshRuns, updateRun: vi.fn() });

    expect(apiClient.revokeChecklistRunShare).toHaveBeenCalledWith('run-1');
    // Stopping sharing does not bump the revision, so later saves keep working.
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
