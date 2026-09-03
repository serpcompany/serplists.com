import { describe, expect, it, vi } from 'vitest';

import { createApiError } from '@/lib/api-errors';
import type { ChecklistRun } from '@/types/checklist';

import {
  createRunExecutionShare,
  loadRunExecutionData,
  saveRunItemNotes,
  saveRunSubItemNotes,
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
    const updateRun = vi.fn();
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
  });

  it('persists notes for an individual sub-task', async () => {
    const updateRun = vi.fn();

    const result = await saveRunSubItemNotes(
      {
        contentIndex: 0,
        itemId: 'item-1',
        notes: 'Waiting for reply',
        run: buildRun(),
        subItemIndex: 1,
      },
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
    const content = result.run?.sections[0]?.items[0]?.contents?.[0];
    expect(content?.type === 'subItems' ? content.subItems?.[1]?.notes : undefined).toBe(
      'Waiting for reply',
    );
    expect(updateRun).toHaveBeenCalledOnce();
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
