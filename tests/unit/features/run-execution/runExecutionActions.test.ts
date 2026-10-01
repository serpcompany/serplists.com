import { describe, expect, it, vi } from 'vitest';

import { createApiError } from '@/lib/api-errors';
import type { ChecklistRun } from '@/types/checklist';

import {
  completeRunExecution,
  saveRunExecutionTitle,
  saveRunItemNotes,
  toggleRunItem,
  toggleRunSubItem,
} from '@/features/run-execution/runExecutionActions';
import { createRunExecutionShare, stopRunExecutionSharing } from '@/features/run-execution/runSharing';

import { buildRun, runExecutionApiClient } from '../../../fixtures/runExecutionFixtures';

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

const withEveryTaskAndSubTaskTicked = (run: ChecklistRun): ChecklistRun => ({
  ...run,
  sections: run.sections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      isCompleted: true,
      contents: item.contents?.map((content) => ({
        ...content,
        subItems: content.subItems?.map((subItem) => ({ ...subItem, isCompleted: true })),
      })),
    })),
  })),
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

describe('unsaved task notes ride along with the save that would lose them', () => {

  it('Mark Complete saves the draft notes of that task in the same PUT', async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => ({ ...run, revision: 2 }));

    const result = await toggleRunItem(
      {
        isCompleted: true,
        itemId: 'item-1',
        noteDrafts: { 'item-1': 'Deployed build 42, see link', 'item-2': 'not this one' },
        run: buildRun(),
      },
      { apiClient: runExecutionApiClient(), updateRun },
    );

    expect(result.kind).toBe('ok');
    expect(updateRun).toHaveBeenCalledOnce();
    const sent = updateRun.mock.calls[0][0];
    expect(sent.revision).toBe(1);
    expect(sent.sections[0].items[0]).toMatchObject({ isCompleted: true, notes: 'Deployed build 42, see link' });
    expect(sent.sections[0].items[1].notes).toBeUndefined();
  });

  const runWhoseFirstTaskWasCompletedFirst = (notes?: string): ChecklistRun => {
    const run = buildRun();
    const [first, ...rest] = run.sections[0].items;
    const done = {
      ...first,
      isCompleted: true,
      notes,
      contents: first.contents?.map((content) => ({
        ...content,
        subItems: content.subItems?.map((sub) => ({ ...sub, isCompleted: true })),
      })),
    };
    return { ...run, sections: [{ ...run.sections[0], items: [done, ...rest] }] };
  };

  it('Mark Complete saves the draft notes of a task that a teammate or a queued Sub-task save already completed', async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => ({ ...run, revision: 2 }));

    const result = await toggleRunItem(
      { isCompleted: true, itemId: 'item-1', noteDrafts: { 'item-1': 'x' }, run: runWhoseFirstTaskWasCompletedFirst() },
      { apiClient: runExecutionApiClient(), updateRun },
    );

    expect(updateRun).toHaveBeenCalledOnce();
    const sent = updateRun.mock.calls[0][0];
    expect(sent.revision).toBe(1);
    expect(sent.sections[0].items[0]).toMatchObject({ isCompleted: true, notes: 'x' });
    expect(sent.sections[0].items[0].contents?.[0]?.subItems?.every((sub) => sub.isCompleted)).toBe(true);
    expect(result).toMatchObject({ kind: 'ok', run: { revision: 2 } });
  });

  it('saves the draft through a shared link when the task is already complete', async () => {
    const client = { ...runExecutionApiClient(), updateSharedChecklist: vi.fn(async () => ({ revision: 2 })) };

    const result = await toggleRunItem(
      { isCompleted: true, itemId: 'item-1', noteDrafts: { 'item-1': 'x' }, run: runWhoseFirstTaskWasCompletedFirst(), shareToken: 'share-1' },
      { apiClient: client, updateRun: vi.fn() },
    );

    expect(client.updateSharedChecklist).toHaveBeenCalledOnce();
    expect(client.updateSharedChecklist.mock.calls[0]).toMatchObject([
      'share-1',
      { expected_revision: 1, sections: [{ items: [{ isCompleted: true, notes: 'x' }, {}] }] },
    ]);
    expect(result).toMatchObject({ kind: 'ok', run: { revision: 2 } });
  });

  it('sends nothing for a complete task whose draft matches its saved notes, or for another task', async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => run);
    const run = runWhoseFirstTaskWasCompletedFirst('x');

    const same = await toggleRunItem(
      { isCompleted: true, itemId: 'item-1', noteDrafts: { 'item-1': 'x', 'item-2': 'other task' }, run },
      { apiClient: runExecutionApiClient(), updateRun },
    );

    expect(same).toMatchObject({ kind: 'ok', run });
    expect(updateRun).not.toHaveBeenCalled();
  });

  it('completing the run saves every draft before the page leaves', async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => run);
    const doneRun = withEveryTaskAndSubTaskTicked(buildRun());

    const result = await completeRunExecution(
      { noteDrafts: { 'item-1': 'first', 'item-2': 'second' }, run: doneRun },
      { apiClient: runExecutionApiClient(), updateRun },
    );

    expect(result.kind).toBe('ok');
    expect(updateRun).toHaveBeenCalledOnce();
    expect(updateRun.mock.calls[0][0].sections[0].items.map((item) => item.notes)).toEqual(['first', 'second']);
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

describe('saving the run title, which a double click on Rename or Enter in the untouched editor submits unchanged', () => {
  it('does not send a PUT, which bumps the revision and writes an audit event, for an unchanged title, even with surrounding spaces', async () => {
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
    expect(updateRun).toHaveBeenCalledWith(expect.objectContaining({ title: 'Launch v2' }), { includeTitle: true });
  });

  it("refuses a title over the API's 160-character limit with a clear message, not the API's raw schema error, and sends nothing", async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => run);

    const result = await saveRunExecutionTitle({ run: buildRun(), title: 'a'.repeat(161) }, { updateRun });

    expect(result).toEqual({ kind: 'error', message: 'Run title must be 160 characters or fewer.' });
    expect(updateRun).not.toHaveBeenCalled();
  });

  it('accepts a title at the limit, measured after trimming', async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => run);
    const title = 'a'.repeat(160);

    const result = await saveRunExecutionTitle({ run: buildRun(), title: `  ${title}  ` }, { updateRun });

    expect(result.kind).toBe('ok');
    expect(updateRun).toHaveBeenCalledWith(expect.objectContaining({ title }), { includeTitle: true });
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

describe('Sub-tasks in more than one block', () => {
  it('keeps the task open while another Sub-tasks block has an unfinished Sub-task', async () => {
    const run = buildRun();
    run.sections[0].items[0].contents = [
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
      run: expect.objectContaining({ id: 'run-1', isPublic: true }),
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
