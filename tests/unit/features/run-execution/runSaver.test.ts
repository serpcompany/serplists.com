import { describe, expect, it, vi } from 'vitest';

import { createApiError } from '@/lib/api-errors';
import type { ChecklistRun, ChecklistSection } from '@/types/checklist';

import type { NoteDrafts } from '@/features/run-execution/noteDrafts';
import type { RunExecutionActionResult } from '@/features/run-execution/runExecutionResult';
import { createRunSaver, RUN_CHANGED_ELSEWHERE_MESSAGE, type RunSaverContext } from '@/features/run-execution/runSaver';
import { bindRunSaves, toggleRunItem, toggleRunSubItem } from '@/features/run-execution/runExecutionActions';
import { loadRunExecutionData } from '@/features/run-execution/runExecutionLoad';

const CONFLICT = { code: 'edit_conflict', error: 'Checklist run changed since it was loaded. Refresh before saving again.' };

const sections = (done: Record<string, boolean>, notes: Record<string, string> = {}): ChecklistSection[] => [
  {
    id: 'section-1',
    title: 'Checklist',
    items: ['item-1', 'item-2', 'item-3'].map((id) => ({
      id,
      title: id,
      isCompleted: done[id] === true,
      notes: notes[id],
      contents:
        id === 'item-3'
          ? [{ type: 'subItems' as const, value: '', subItems: [{ id: 'sub-1', title: 'Sub', isCompleted: done['sub-1'] === true }] }]
          : [],
    })),
  },
];

const buildRun = (revision: number, done: Record<string, boolean> = {}, notes: Record<string, string> = {}): ChecklistRun => ({
  id: 'run-1',
  templateId: 'template-1',
  title: 'Launch',
  status: 'in_progress',
  progress: 0,
  sections: sections(done, notes),
  startedAt: '2026-04-18T00:00:00.000Z',
  userId: 'user-1',
  templateVersion: 1,
  revision,
});

// A server that holds one run and refuses a save whose revision is not the current one,
// like PUT /api/checklists/:id and PUT /api/shared/:token.
const createServer = (initial: ChecklistRun) => {
  let stored = initial;
  const sent: ChecklistRun[] = [];
  const accept = (run: ChecklistRun) => {
    sent.push(run);
    if (run.revision !== stored.revision) throw createApiError(409, CONFLICT);
    stored = { ...run, revision: stored.revision + 1 };
    return stored;
  };
  const record = () => ({
    id: stored.id,
    title: stored.title,
    status: stored.status,
    sections: stored.sections,
    revision: stored.revision,
    template_id: stored.templateId,
  });
  return {
    apiClient: {
      createChecklistRunShare: vi.fn(),
      getChecklistById: vi.fn(async () => record()),
      getSharedChecklist: vi.fn(async () => record()),
      updateSharedChecklist: vi.fn(async (_token: string, body: { expected_revision: number; sections: ChecklistSection[]; status: string }) => {
        const saved = accept({ ...stored, revision: body.expected_revision, sections: body.sections, status: body.status as ChecklistRun['status'] });
        return { revision: saved.revision };
      }),
    },
    edit: (change: (run: ChecklistRun) => ChecklistRun) => {
      stored = { ...change(stored), revision: stored.revision + 1 };
    },
    sent,
    stored: () => stored,
    updateRun: vi.fn(async (run: ChecklistRun) => accept(run)),
  };
};

// Mirrors the hook: an ok result's run becomes the latest run the next save builds on.
const createPage = (
  server: ReturnType<typeof createServer>,
  initial: ChecklistRun,
  shareToken?: string,
  noteDrafts: NoteDrafts = {},
) => {
  const page = { latest: initial as ChecklistRun | null, notFound: false };
  const dependencies = { apiClient: server.apiClient, updateRun: server.updateRun };
  const context: RunSaverContext = {
    apply: (result: RunExecutionActionResult) => {
      if (result.kind === 'ok' && result.run) page.latest = result.run;
      return result;
    },
    latest: () => page.latest,
    onNotFound: () => {
      page.notFound = true;
    },
    reload: () => loadRunExecutionData({ runId: shareToken ? undefined : 'run-1', shareToken }, dependencies),
  };
  const saver = createRunSaver();
  const saves = bindRunSaves({ dependencies, noteDrafts: () => noteDrafts, shareToken });
  return { context, page, saver, saves };
};

describe('a run page whose run was saved by another session', () => {
  it('reloads on an edit conflict, retries once on the latest run, and keeps both changes', async () => {
    const server = createServer(buildRun(5));
    const { context, page, saver, saves } = createPage(server, buildRun(5));
    server.edit((run) => ({ ...run, sections: sections({ 'item-1': true }) })); // U1 ticks task 1 -> revision 6

    const result = await saver(saves.toggleItem('item-2', true), context);

    expect(result).toMatchObject({ kind: 'ok' });
    expect(server.sent.map((run) => run.revision)).toEqual([5, 6]);
    expect(server.stored().revision).toBe(7);
    expect(page.latest?.revision).toBe(7);
    expect(page.latest?.sections[0]?.items.map((item) => item.isCompleted)).toEqual([true, true, false]);
  });

  it('builds saves queued behind the conflict on the reloaded run', async () => {
    const server = createServer(buildRun(5));
    const { context, page, saver, saves } = createPage(server, buildRun(5));
    server.edit((run) => ({ ...run, sections: sections({ 'item-1': true }) }));

    const [first, second] = await Promise.all([
      saver(saves.toggleItem('item-2', true), context),
      saver(saves.toggleSubItem('item-3', 0, 0, true), context),
    ]);

    expect(first.kind).toBe('ok');
    expect(second.kind).toBe('ok');
    expect(server.sent.map((run) => run.revision)).toEqual([5, 6, 7]);
    expect(page.latest?.revision).toBe(8);
    expect(page.latest?.sections[0]?.items.map((item) => item.isCompleted)).toEqual([true, true, true]);
  });

  it('does not undo a tick the other session already made on the same task', async () => {
    const server = createServer(buildRun(5));
    const { context, page, saver, saves } = createPage(server, buildRun(5));
    server.edit((run) => ({ ...run, sections: sections({ 'item-1': true }) }));

    const result = await saver(saves.toggleItem('item-1', true), context);

    expect(result.kind).toBe('ok');
    expect(server.sent).toHaveLength(1); // the refused save; the task already had the chosen value
    expect(server.stored().sections[0]?.items[0]?.isCompleted).toBe(true);
    expect(page.latest?.sections[0]?.items[0]?.isCompleted).toBe(true);
  });

  it('does not undo a sub-task tick the other session already made', async () => {
    const server = createServer(buildRun(5));
    const { context, page, saver, saves } = createPage(server, buildRun(5));
    server.edit((run) => ({ ...run, sections: sections({ 'item-3': true, 'sub-1': true }) }));

    const result = await saver(saves.toggleSubItem('item-3', 0, 0, true), context);

    expect(result.kind).toBe('ok');
    expect(server.sent).toHaveLength(1);
    expect(page.latest?.sections[0]?.items[2]?.contents?.[0]?.subItems?.[0]?.isCompleted).toBe(true);
  });

  it('retries only once and then reports the conflict with the latest run shown', async () => {
    const server = createServer(buildRun(5));
    const { context, page, saver, saves } = createPage(server, buildRun(5));
    server.edit((run) => run);
    server.apiClient.getChecklistById.mockImplementation(async () => {
      server.edit((run) => run); // someone saves again between the reload and the retry
      return { id: 'run-1', sections: server.stored().sections, revision: server.stored().revision - 1, status: 'in_progress' };
    });

    const result = await saver(saves.toggleItem('item-2', true), context);

    expect(result).toEqual({ kind: 'error', message: RUN_CHANGED_ELSEWHERE_MESSAGE });
    expect(server.sent).toHaveLength(2);
    expect(page.latest?.revision).toBe(6);
  });

  it('marks the run not found when the reload finds it gone', async () => {
    const server = createServer(buildRun(5));
    const { context, page, saver, saves } = createPage(server, buildRun(5));
    server.edit((run) => run);
    server.apiClient.getChecklistById.mockRejectedValue(createApiError(404, { error: 'Not found' }));

    const result = await saver(saves.toggleItem('item-2', true), context);

    expect(result).toEqual({ kind: 'not_found' });
    expect(page.notFound).toBe(true);
    expect(server.sent).toHaveLength(1);
  });

  it('does not overwrite task notes another session changed', async () => {
    const server = createServer(buildRun(5, {}, { 'item-1': 'old' }));
    const { context, page, saver, saves } = createPage(server, buildRun(5, {}, { 'item-1': 'old' }));
    server.edit((run) => ({ ...run, sections: sections({}, { 'item-1': 'teammate' }) }));

    const result = await saver(saves.notes('item-1', 'mine'), context);

    expect(result).toEqual({ kind: 'error', message: RUN_CHANGED_ELSEWHERE_MESSAGE });
    expect(server.sent).toHaveLength(1);
    expect(server.stored().sections[0]?.items[0]?.notes).toBe('teammate');
    expect(page.latest?.sections[0]?.items[0]?.notes).toBe('teammate');
  });

  it('retries a notes save when the other session changed a different task', async () => {
    const server = createServer(buildRun(5));
    const { context, saver, saves } = createPage(server, buildRun(5));
    server.edit((run) => ({ ...run, sections: sections({ 'item-2': true }) }));

    const result = await saver(saves.notes('item-1', 'mine'), context);

    expect(result.kind).toBe('ok');
    expect(server.stored().sections[0]?.items.map((item) => [item.isCompleted, item.notes])).toEqual([
      [false, 'mine'],
      [true, undefined],
      [false, undefined],
    ]);
  });

  // The page moves on once Mark Complete lands, so its notes must be saved even when the
  // retry finds the task already complete.
  it('saves the task notes with Mark Complete when the other session already completed the task', async () => {
    const server = createServer(buildRun(5));
    const { context, saver, saves } = createPage(server, buildRun(5), undefined, { 'item-1': 'mine' });
    server.edit((run) => ({ ...run, sections: sections({ 'item-1': true }) }));

    const result = await saver(saves.toggleItem('item-1', true), context);

    expect(result.kind).toBe('ok');
    expect(server.sent.map((run) => run.revision)).toEqual([5, 6]);
    expect(server.stored().sections[0]?.items[0]).toMatchObject({ isCompleted: true, notes: 'mine' });
  });

  it('does not send completion again when the other session already completed the run', async () => {
    const allDone = { 'item-1': true, 'item-2': true, 'item-3': true, 'sub-1': true };
    const server = createServer(buildRun(5, allDone));
    const { context, page, saver, saves } = createPage(server, buildRun(5, allDone));
    server.edit((run) => ({ ...run, completedAt: '2026-04-20T00:00:00.000Z', status: 'completed' }));

    const result = await saver(saves.complete, context);

    expect(result.kind).toBe('ok');
    expect(server.sent).toHaveLength(1);
    expect(page.latest?.status).toBe('completed');
  });

  it('recovers the same way on a shared run link', async () => {
    const server = createServer(buildRun(5));
    const { context, page, saver, saves } = createPage(server, buildRun(5), 'share-token');
    server.edit((run) => ({ ...run, sections: sections({ 'item-1': true }) }));

    const result = await saver(saves.toggleItem('item-2', true), context);

    expect(result.kind).toBe('ok');
    expect(server.apiClient.getSharedChecklist).toHaveBeenCalledWith('share-token');
    expect(server.apiClient.getChecklistById).not.toHaveBeenCalled();
    expect(server.sent.map((run) => run.revision)).toEqual([5, 6]);
    expect(page.latest?.sections[0]?.items.map((item) => item.isCompleted)).toEqual([true, true, false]);
  });
});

describe('run actions keep what the retry needs', () => {
  it('keeps the API error code on an error result', async () => {
    const updateRun = vi.fn(async () => {
      throw createApiError(409, CONFLICT);
    });

    const result = await toggleRunItem({ isCompleted: true, itemId: 'item-1', run: buildRun(5) }, { updateRun });

    expect(result).toEqual({ kind: 'error', code: 'edit_conflict', message: CONFLICT.error });
  });

  it('writes nothing when the task already has the chosen value', async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => run);
    const run = buildRun(5, { 'item-1': true });

    const result = await toggleRunItem({ isCompleted: true, itemId: 'item-1', run }, { updateRun });

    expect(result).toMatchObject({ kind: 'ok', run });
    expect(updateRun).not.toHaveBeenCalled();
  });
});

describe('toggles queued while an earlier save is in flight', () => {
  // item-2 has sub-tasks [a, b]; the page shows the run as it was before the first save.
  const twoSubTasks = (done: Record<string, boolean>): ChecklistRun => ({
    ...buildRun(1),
    sections: [
      {
        id: 'section-1',
        title: 'Checklist',
        items: [
          { id: 'item-1', title: 'item-1', isCompleted: false, contents: [] },
          {
            id: 'item-2',
            title: 'item-2',
            isCompleted: done['item-2'] === true,
            contents: [
              {
                type: 'subItems',
                value: '',
                subItems: [
                  { id: 'a', title: 'A', isCompleted: done.a === true },
                  { id: 'b', title: 'B', isCompleted: done.b === true },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  const task = (page: { latest: ChecklistRun | null }) => {
    const item = page.latest?.sections[0]?.items[1];
    return [item?.isCompleted, ...(item?.contents?.[0]?.subItems ?? []).map((sub) => sub.isCompleted)];
  };

  it('Mark Complete, then ticking a sub-task that still looks unticked, keeps both ticked', async () => {
    const server = createServer(twoSubTasks({}));
    const { context, page, saver, saves } = createPage(server, twoSubTasks({}));

    await Promise.all([
      saver(saves.toggleItem('item-2', true), context),
      saver(saves.toggleSubItem('item-2', 0, 0, true), context),
    ]);

    expect(task(page)).toEqual([true, true, true]);
    expect(server.sent).toHaveLength(1); // the sub-task was already ticked: nothing more to save
  });

  it('ticking the last sub-task, then Mark Complete before it saves, keeps every sub-task ticked', async () => {
    const server = createServer(twoSubTasks({ b: true }));
    const { context, page, saver, saves } = createPage(server, twoSubTasks({ b: true }));

    await Promise.all([
      saver(saves.toggleSubItem('item-2', 0, 0, true), context),
      saver(saves.toggleItem('item-2', true), context),
    ]);

    expect(task(page)).toEqual([true, true, true]);
    expect(server.stored().sections[0]?.items[1]?.isCompleted).toBe(true);
    expect(server.sent).toHaveLength(1);
  });

  it('ticking the last sub-task, then typing a note and Mark Complete, saves the note', async () => {
    const server = createServer(twoSubTasks({ b: true }));
    const { context, saver, saves } = createPage(server, twoSubTasks({ b: true }), undefined, { 'item-2': 'checked' });

    await Promise.all([
      saver(saves.toggleSubItem('item-2', 0, 0, true), context),
      saver(saves.toggleItem('item-2', true), context),
    ]);

    expect(server.stored().sections[0]?.items[1]).toMatchObject({ isCompleted: true, notes: 'checked' });
    expect(server.sent).toHaveLength(2);
  });

  it('applies an untick as an untick even when the task changed before it ran', async () => {
    const server = createServer(twoSubTasks({ 'item-2': true, a: true, b: true }));
    const { context, page, saver, saves } = createPage(server, twoSubTasks({ 'item-2': true, a: true, b: true }));

    await Promise.all([
      saver(saves.toggleSubItem('item-2', 0, 1, false), context),
      saver(saves.toggleItem('item-2', false), context),
    ]);

    expect(task(page)).toEqual([false, false, false]);
  });
});

describe('toggle keys and no-op saves', () => {
  it('ignores a double click that asks for the same value, but queues a different one', async () => {
    const server = createServer(buildRun(1));
    const { context, page, saver, saves } = createPage(server, buildRun(1));

    const [first, repeat] = await Promise.all([
      saver(saves.toggleItem('item-1', true), context),
      saver(saves.toggleItem('item-1', true), context),
    ]);
    expect(first.kind).toBe('ok');
    expect(repeat).toEqual({ kind: 'ignored' });

    await Promise.all([
      saver(saves.toggleSubItem('item-3', 0, 0, true), context),
      saver(saves.toggleSubItem('item-3', 0, 0, false), context),
    ]);
    expect(page.latest?.sections[0]?.items[2]?.contents?.[0]?.subItems?.[0]?.isCompleted).toBe(false);
    expect(server.sent).toHaveLength(3);
  });

  it('Mark Complete still saves when the task is done but a sub-task is not', async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => run);
    const run = buildRun(1, { 'item-3': true });

    const result = await toggleRunItem({ isCompleted: true, itemId: 'item-3', run }, { updateRun });

    expect(updateRun).toHaveBeenCalledOnce();
    if (result.kind !== 'ok' || !result.run) throw new Error('expected ok result');
    expect(result.run.sections[0]?.items[2]?.contents?.[0]?.subItems?.[0]?.isCompleted).toBe(true);
  });

  it('sends nothing when a sub-task already has the chosen value', async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => run);
    const run = buildRun(1, { 'item-3': true, 'sub-1': true });

    const result = await toggleRunSubItem(
      { contentIndex: 0, isCompleted: true, itemId: 'item-3', run, subItemIndex: 0 },
      { updateRun },
    );

    expect(result).toMatchObject({ kind: 'ok', run });
    expect(updateRun).not.toHaveBeenCalled();
  });
});

describe('a run completed while a toggle waits in the queue', () => {
  it('refuses the toggle once completion has landed, so the run never reads Completed with open tasks', async () => {
    const allDone = { 'item-1': true, 'item-2': true, 'item-3': true, 'sub-1': true };
    const server = createServer(buildRun(5, allDone));
    const { context, page, saver, saves } = createPage(server, buildRun(5, allDone));

    const [completed, untick] = await Promise.all([
      saver(saves.complete, context),
      saver(saves.toggleItem('item-1', false), context),
    ]);

    expect(completed.kind).toBe('ok');
    expect(untick.kind).toBe('error');
    expect(server.sent).toHaveLength(1);
    expect(server.stored().status).toBe('completed');
    expect(server.stored().sections[0]?.items.every((item) => item.isCompleted)).toBe(true);
    expect(page.latest?.status).toBe('completed');
  });
});

// The run Changelog refreshes once the saves settle, not once per click (each refresh reads
// D1).
describe('refreshing after saves', () => {
  it('reports once, with the latest run, when a burst of saves has finished and one of them saved', async () => {
    const server = createServer(buildRun(5));
    const { context, page } = createPage(server, buildRun(5));
    const onSaved = vi.fn();
    const saver = createRunSaver(onSaved);
    const saves = bindRunSaves({ dependencies: { apiClient: server.apiClient, updateRun: server.updateRun }, noteDrafts: () => ({}) });

    await Promise.all([
      saver(saves.toggleItem('item-1', true), context),
      saver(saves.toggleItem('item-1', true), context), // a double click, ignored
      saver(saves.toggleItem('item-2', true), context),
    ]);

    expect(server.sent).toHaveLength(2);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenLastCalledWith(page.latest);

    await saver(saves.toggleSubItem('item-3', 0, 0, true), context);
    expect(onSaved).toHaveBeenCalledTimes(2);
    expect(onSaved).toHaveBeenLastCalledWith(page.latest);
  });

  it('does not report when nothing was saved', async () => {
    const server = createServer(buildRun(5));
    const { context } = createPage(server, buildRun(5));
    server.updateRun.mockRejectedValue(new Error('offline'));
    const onSaved = vi.fn();
    const saver = createRunSaver(onSaved);
    const saves = bindRunSaves({ dependencies: { apiClient: server.apiClient, updateRun: server.updateRun }, noteDrafts: () => ({}) });

    const result = await saver(saves.toggleItem('item-1', true), context);

    expect(result.kind).toBe('error');
    expect(onSaved).not.toHaveBeenCalled();
  });
});
