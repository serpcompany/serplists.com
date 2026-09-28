import { describe, expect, it, vi } from 'vitest';

import { createApiError } from '@/lib/api-errors';
import type { ChecklistRun } from '@/types/checklist';

import {
  completeRunExecution,
  createRunExecutionShare,
  loadRunExecutionData,
  saveRunExecutionTitle,
  saveRunItemNotes,
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
        isCompleted: true,
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
        isCompleted: true,
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
        isCompleted: true,
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

describe('completing a run', () => {
  const apiClient = () => ({
    createChecklistRunShare: vi.fn(),
    getChecklistById: vi.fn(),
    getSharedChecklist: vi.fn(),
    updateSharedChecklist: vi.fn(),
  });
  const allDone = (run: ChecklistRun): ChecklistRun => ({
    ...run,
    sections: run.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => ({ ...item, isCompleted: true })),
    })),
  });

  it('completes an in-progress run whose tasks are all done', async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => run);

    const result = await completeRunExecution(
      { run: allDone(buildRun()), completedAt: '2026-05-01T00:00:00.000Z' },
      { apiClient: apiClient(), updateRun },
    );

    expect(result.kind).toBe('ok');
    expect(updateRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', completedAt: '2026-05-01T00:00:00.000Z' }),
    );
  });

  it('refuses when the latest run still has open tasks (a queued untick landed first)', async () => {
    const updateRun = vi.fn();

    const result = await completeRunExecution({ run: buildRun() }, { apiClient: apiClient(), updateRun });

    expect(result.kind).toBe('error');
    expect(updateRun).not.toHaveBeenCalled();
  });

  it('does not re-send completion for a run that is already completed', async () => {
    const updateRun = vi.fn();
    const run = allDone(buildRun({ status: 'completed', completedAt: '2026-04-20T00:00:00.000Z' }));

    const result = await completeRunExecution({ run }, { apiClient: apiClient(), updateRun });

    expect(result).toEqual({ kind: 'ok', run });
    expect(updateRun).not.toHaveBeenCalled();
  });
});

describe('unsaved task notes ride along with the save that would lose them', () => {
  const apiClient = () => ({
    createChecklistRunShare: vi.fn(),
    getChecklistById: vi.fn(),
    getSharedChecklist: vi.fn(),
    updateSharedChecklist: vi.fn(),
  });

  it('Mark Complete saves the draft notes of that task in the same PUT', async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => ({ ...run, revision: 2 }));

    const result = await toggleRunItem(
      {
        isCompleted: true,
        itemId: 'item-1',
        noteDrafts: { 'item-1': 'Deployed build 42, see link', 'item-2': 'not this one' },
        run: buildRun(),
      },
      { apiClient: apiClient(), updateRun },
    );

    expect(result.kind).toBe('ok');
    expect(updateRun).toHaveBeenCalledOnce();
    const sent = updateRun.mock.calls[0][0];
    expect(sent.revision).toBe(1);
    expect(sent.sections[0].items[0]).toMatchObject({ isCompleted: true, notes: 'Deployed build 42, see link' });
    expect(sent.sections[0].items[1].notes).toBeUndefined();
  });

  it('completing the run saves every draft before the page leaves', async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => run);
    const run = buildRun();
    const doneRun: ChecklistRun = {
      ...run,
      sections: run.sections.map((section) => ({
        ...section,
        items: section.items.map((item) => ({ ...item, isCompleted: true })),
      })),
    };

    const result = await completeRunExecution(
      { noteDrafts: { 'item-1': 'first', 'item-2': 'second' }, run: doneRun },
      { apiClient: apiClient(), updateRun },
    );

    expect(result.kind).toBe('ok');
    expect(updateRun).toHaveBeenCalledOnce();
    expect(updateRun.mock.calls[0][0].sections[0].items.map((item) => item.notes)).toEqual(['first', 'second']);
  });
});


describe('a task with several Sub-tasks blocks', () => {
  // Task item-1 has blocks [a, b] and [c], with a text block and an empty block between them.
  const multiBlockRun = (): ChecklistRun =>
    buildRun({
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
                    { id: 'a', title: 'A', isCompleted: false },
                    { id: 'b', title: 'B', isCompleted: false },
                  ],
                },
                { type: 'text', value: 'Notes between blocks' },
                { type: 'subItems', value: '', subItems: [] },
                { type: 'subItems', value: '', subItems: [{ id: 'c', title: 'C', isCompleted: false }] },
              ],
            },
            { id: 'item-2', title: 'Second item', isCompleted: true, contents: [] },
          ],
        },
      ],
    });

  const toggle = async (run: ChecklistRun, contentIndex: number, subItemIndex: number, isCompleted: boolean) => {
    const result = await toggleRunSubItem(
      { contentIndex, isCompleted, itemId: 'item-1', run, subItemIndex },
      { updateRun: vi.fn(async (next: ChecklistRun) => next) },
    );
    if (result.kind !== 'ok' || !result.run) {
      throw new Error('expected ok result');
    }
    return { run: result.run, shouldPromptComplete: result.shouldPromptComplete };
  };

  it('stays open until every sub-task in every block is ticked', async () => {
    const afterC = await toggle(multiBlockRun(), 3, 0, true);
    expect(afterC.run.sections[0]?.items[0]?.isCompleted).toBe(false);
    expect(afterC.shouldPromptComplete).toBe(false);

    const afterA = await toggle(afterC.run, 0, 0, true);
    expect(afterA.run.sections[0]?.items[0]?.isCompleted).toBe(false);
    expect(afterA.shouldPromptComplete).toBe(false);

    const afterB = await toggle(afterA.run, 0, 1, true);
    expect(afterB.run.sections[0]?.items[0]?.isCompleted).toBe(true);
    expect(afterB.shouldPromptComplete).toBe(true);

    const untickA = await toggle(afterB.run, 0, 0, false);
    expect(untickA.run.sections[0]?.items[0]?.isCompleted).toBe(false);
    expect(untickA.shouldPromptComplete).toBe(false);
  });

  it('clears a task completed with Mark Complete when a sub-task in another block is unticked', async () => {
    const marked = await toggleRunItem(
      { isCompleted: true, itemId: 'item-1', run: multiBlockRun() },
      { updateRun: vi.fn(async (next: ChecklistRun) => next) },
    );
    if (marked.kind !== 'ok' || !marked.run) {
      throw new Error('expected ok result');
    }
    const item = marked.run.sections[0]?.items[0];
    expect(item?.isCompleted).toBe(true);
    expect(item?.contents?.flatMap((content) => content.subItems ?? []).every((sub) => sub.isCompleted)).toBe(true);

    const untickC = await toggle(marked.run, 3, 0, false);
    expect(untickC.run.sections[0]?.items[0]?.isCompleted).toBe(false);
  });
});

// A double click on Rename lands its second click on Save title, and Enter can submit the
// editor untouched. An unchanged title must not send a PUT (which bumps the revision and
// writes an audit event).
describe('saving the run title', () => {
  it('does not persist a title that is unchanged, even with surrounding spaces', async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => run);
    const run = buildRun();

    const same = await saveRunExecutionTitle({ run, title: 'Launch checklist' }, { updateRun });
    const padded = await saveRunExecutionTitle({ run, title: '  Launch checklist  ' }, { updateRun });

    expect(same).toEqual({ kind: 'ok', run });
    expect(padded).toEqual({ kind: 'ok', run });
    expect(updateRun).not.toHaveBeenCalled();
  });

  it('persists a changed title once, trimmed', async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => run);

    const result = await saveRunExecutionTitle({ run: buildRun(), title: ' Launch v2 ' }, { updateRun });

    expect(result.kind).toBe('ok');
    expect(updateRun).toHaveBeenCalledTimes(1);
    expect(updateRun).toHaveBeenCalledWith(expect.objectContaining({ title: 'Launch v2' }));
  });
});

// Completed runs are frozen (docs/product-specs/features.md). Unticking a task on one used
// to save it as Completed with open tasks, and re-ticking never offered completion again.
describe('a completed run', () => {
  const completedRun = () =>
    buildRun({
      completedAt: '2026-04-20T00:00:00.000Z',
      progress: 100,
      sections: buildRun().sections.map((section) => ({
        ...section,
        items: section.items.map((item) => ({
          ...item,
          isCompleted: true,
          contents: item.contents?.map((content) => ({
            ...content,
            subItems: content.subItems?.map((sub) => ({ ...sub, isCompleted: true })),
          })),
        })),
      })),
      status: 'completed',
    });
  const apiClient = () => ({
    createChecklistRunShare: vi.fn(),
    getChecklistById: vi.fn(),
    getSharedChecklist: vi.fn(),
    updateSharedChecklist: vi.fn(),
  });

  it('refuses to untick a task, privately or through a share link, and saves nothing', async () => {
    const updateRun = vi.fn();
    const client = apiClient();

    const privateResult = await toggleRunItem(
      { isCompleted: false, itemId: 'item-2', run: completedRun() },
      { apiClient: client, updateRun },
    );
    const sharedResult = await toggleRunItem(
      { isCompleted: false, itemId: 'item-2', run: completedRun(), shareToken: 'share-1' },
      { apiClient: client, updateRun },
    );

    expect(privateResult.kind).toBe('error');
    expect(sharedResult.kind).toBe('error');
    expect(updateRun).not.toHaveBeenCalled();
    expect(client.updateSharedChecklist).not.toHaveBeenCalled();
  });

  it('refuses to untick a sub-task and saves nothing', async () => {
    const updateRun = vi.fn();
    const client = apiClient();

    const result = await toggleRunSubItem(
      { contentIndex: 0, isCompleted: false, itemId: 'item-1', run: completedRun(), shareToken: 'share-1', subItemIndex: 0 },
      { apiClient: client, updateRun },
    );

    expect(result.kind).toBe('error');
    expect(updateRun).not.toHaveBeenCalled();
    expect(client.updateSharedChecklist).not.toHaveBeenCalled();
  });
});

// The runs list is cached for 5 minutes; a share made here must reach it, or it keeps
// offering Revalidate, which the API refuses for a shared run.
describe('sharing from the run page', () => {
  const apiClient = (createChecklistRunShare: ReturnType<typeof vi.fn>) => ({
    createChecklistRunShare,
    getChecklistById: vi.fn(),
    getSharedChecklist: vi.fn(),
    updateSharedChecklist: vi.fn(),
  });

  it('reports the shared run and marks the run on the page public, at the same revision', async () => {
    const onShared = vi.fn();
    const client = apiClient(vi.fn().mockResolvedValue({ shareToken: 'token-1' }));

    const result = await createRunExecutionShare(
      { run: buildRun({ isPublic: false, revision: 4 }) },
      { apiClient: client, onShared, origin: 'https://serplists.com', updateRun: vi.fn() },
    );

    expect(result).toMatchObject({ kind: 'ok', shareUrl: 'https://serplists.com/share/token-1' });
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
