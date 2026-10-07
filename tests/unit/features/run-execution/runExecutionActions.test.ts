import { describe, expect, it, vi } from 'vitest';
import { taskAt } from '../../../support/elements';

import type { ChecklistRun } from '@/types/checklist';

import {
  completeRunExecution,
  saveRunItemNotes,
  toggleRunItem,
  toggleRunSubItem,
} from '@/features/run-execution/runExecutionActions';
import { createRunExecutionShare } from '@/features/run-execution/runSharing';

import { buildRun, runExecutionApiClient, withEveryTaskAndSubTaskTicked } from '../../../fixtures/runExecutionFixtures';

describe('run execution model actions', () => {
  it('persists task notes on the run without changing the template', async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => ({ ...run, revision: 2 }));
    const run = buildRun();

    const result = await saveRunItemNotes(
      { itemId: 'item-1', notes: 'Sent email: https://example.com/message/42', run },
      { apiClient: runExecutionApiClient(), updateRun },
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
    const apiClient = runExecutionApiClient();

    const result = await toggleRunItem(
      {
        isCompleted: true,
        itemId: 'item-1',
        run: buildRun(),
      },
      { apiClient, updateRun },
    );

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok' || !result.run) {
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
    const apiClient = runExecutionApiClient();

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
    if (firstToggle.kind !== 'ok' || !firstToggle.run) {
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
    if (secondToggle.kind !== 'ok' || !secondToggle.run) {
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
    const apiClient = runExecutionApiClient();

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
    const apiClient = runExecutionApiClient();

    const result = await createRunExecutionShare(
      {},
      { apiClient, updateRun: vi.fn() },
    );

    expect(result).toEqual({ kind: 'not_found' });
    expect(apiClient.createChecklistRunShare).not.toHaveBeenCalled();
  });
});

describe('completing a run', () => {

  it('completes an in-progress run whose tasks are all done', async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => run);

    const result = await completeRunExecution(
      { run: withEveryTaskAndSubTaskTicked(buildRun()), completedAt: '2026-05-01T00:00:00.000Z' },
      { apiClient: runExecutionApiClient(), updateRun },
    );

    expect(result.kind).toBe('ok');
    expect(updateRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', completedAt: '2026-05-01T00:00:00.000Z' }),
    );
  });

  it('refuses when the latest run still has open tasks (a queued untick landed first)', async () => {
    const updateRun = vi.fn();

    const result = await completeRunExecution({ run: buildRun() }, { apiClient: runExecutionApiClient(), updateRun });

    expect(result.kind).toBe('error');
    expect(updateRun).not.toHaveBeenCalled();
  });

  it('does not re-send completion for a run that is already completed, which would bump its revision and write another audit event', async () => {
    const updateRun = vi.fn();
    const run = withEveryTaskAndSubTaskTicked(buildRun({ status: 'completed', completedAt: '2026-04-20T00:00:00.000Z' }));

    const result = await completeRunExecution({ run }, { apiClient: runExecutionApiClient(), updateRun });

    expect(result).toEqual({ kind: 'ok', run });
    expect(updateRun).not.toHaveBeenCalled();
  });
});

describe('a task with several Sub-tasks blocks', () => {
  const blockWithAAndB = 0;
  const blockWithC = 3;
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
    const afterC = await toggle(multiBlockRun(), blockWithC, 0, true);
    expect(afterC.run.sections[0]?.items[0]?.isCompleted).toBe(false);
    expect(afterC.shouldPromptComplete).toBe(false);

    const afterA = await toggle(afterC.run, blockWithAAndB, 0, true);
    expect(afterA.run.sections[0]?.items[0]?.isCompleted).toBe(false);
    expect(afterA.shouldPromptComplete).toBe(false);

    const afterB = await toggle(afterA.run, blockWithAAndB, 1, true);
    expect(afterB.run.sections[0]?.items[0]?.isCompleted).toBe(true);
    expect(afterB.shouldPromptComplete).toBe(true);

    const untickA = await toggle(afterB.run, blockWithAAndB, 0, false);
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

    const untickC = await toggle(marked.run, blockWithC, 0, false);
    expect(untickC.run.sections[0]?.items[0]?.isCompleted).toBe(false);
  });
});

describe('a completed run, which is frozen so it never reads Completed with open tasks', () => {
  const completedRun = () =>
    withEveryTaskAndSubTaskTicked(buildRun({ completedAt: '2026-04-20T00:00:00.000Z', progress: 100, status: 'completed' }));

  it('refuses to untick a task, privately or through a share link, and saves nothing', async () => {
    const updateRun = vi.fn();
    const client = runExecutionApiClient();

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
    const client = runExecutionApiClient();

    const result = await toggleRunSubItem(
      { contentIndex: 0, isCompleted: false, itemId: 'item-1', run: completedRun(), shareToken: 'share-1', subItemIndex: 0 },
      { apiClient: client, updateRun },
    );

    expect(result.kind).toBe('error');
    expect(updateRun).not.toHaveBeenCalled();
    expect(client.updateSharedChecklist).not.toHaveBeenCalled();
  });
});

describe('Sub-tasks in more than one block', () => {
  it('keeps the task open while another Sub-tasks block has an unfinished Sub-task', async () => {
    const run = buildRun();
    taskAt(run, 0, 0).contents = [
      { type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Short', isCompleted: false }] },
      { type: 'subItems', value: '', subItems: [{ id: 'sub-2', title: 'Tagline', isCompleted: false }] },
    ];
    const apiClient = runExecutionApiClient();

    const result = await toggleRunSubItem(
      { contentIndex: 0, isCompleted: true, itemId: 'item-1', run, shareToken: 'share-token', subItemIndex: 0 },
      { apiClient, updateRun: vi.fn() },
    );

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok' || !result.run) throw new Error('expected ok result');
    expect(result.run.sections[0]?.items[0]?.isCompleted).toBe(false);
    expect(result.shouldPromptComplete).toBe(false);
  });
});
