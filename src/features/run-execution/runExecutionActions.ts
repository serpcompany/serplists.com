import { getRunTitleError } from '@/lib/schemas/nameLimits';
import type { ChecklistRun } from '@/types/checklist';

import {
  areAllRunItemsCompleted,
  areItemSubItemsCompleted,
  cloneRunSections,
  findRunSubItem,
  getSelectedRunItem,
  itemHasCompletion,
  setSubItemsCompletion,
} from './runExecutionMappers';
import { applyNoteDrafts, draftedNotesChanged, hasNoteDraftFor, type NoteDrafts } from './noteDrafts';
import {
  COMPLETED_RUN_FROZEN_MESSAGE,
  toErrorResult,
  type RunExecutionActionResult,
} from './runExecutionResult';
import type { QueuedRunSave, RunSave } from './runSaver';
import {
  persistRun,
  type RunExecutionDependencies,
  type RunExecutionMutationParams,
} from './runPersistence';
import { isRunTitleChange } from './runTitle';
import { createRunExecutionShare, stopRunExecutionSharing } from './runSharing';

type ToggleRunItemParams = RunExecutionMutationParams & {
  isCompleted: boolean;
  itemId: string;
  noteDrafts?: NoteDrafts;
};

type ToggleRunSubItemParams = RunExecutionMutationParams & {
  contentIndex: number;
  isCompleted: boolean;
  itemId: string;
  subItemId?: string | undefined;
  subItemIndex: number;
};

type SaveRunItemNotesParams = RunExecutionMutationParams & {
  itemId: string;
  notes: string;
};

type SaveRunTitleParams = RunExecutionMutationParams & {
  title: string;
};

type CompleteRunExecutionParams = RunExecutionMutationParams & {
  completedAt?: string;
  noteDrafts?: NoteDrafts;
};

const withClonedRun = (run: ChecklistRun): ChecklistRun => ({
  ...run,
  sections: cloneRunSections(run.sections),
});

const saveToggledRun = async (
  run: ChecklistRun,
  runChanged: boolean,
  shareToken: string | undefined,
  dependencies: RunExecutionDependencies,
): Promise<RunExecutionActionResult> => {
  try {
    const saved = runChanged ? await persistRun({ run, shareToken }, dependencies) : run;
    return {
      kind: 'ok',
      run: saved,
      shouldPromptComplete: saved.status !== 'completed' && areAllRunItemsCompleted(saved),
    };
  } catch (error) {
    return toErrorResult(error, 'Unable to save your progress.');
  }
};

export const toggleRunItem = async (
  params: ToggleRunItemParams,
  dependencies: RunExecutionDependencies,
): Promise<RunExecutionActionResult> => {
  if (!params.run) {
    return { kind: 'not_found' };
  }
  if (params.run.status === 'completed') {
    return { kind: 'error', message: COMPLETED_RUN_FROZEN_MESSAGE };
  }

  const nextRun = withClonedRun(
    applyNoteDrafts(params.run, params.noteDrafts ?? {}, [params.itemId]),
  );

  for (const section of nextRun.sections) {
    for (const item of section.items) {
      if (item.id !== params.itemId) {
        continue;
      }

      const { isCompleted } = params;
      if (itemHasCompletion(item, isCompleted)) {
        const notesChanged = hasNoteDraftFor(params.noteDrafts ?? {}, params.run, params.itemId);
        return saveToggledRun(notesChanged ? nextRun : params.run, notesChanged, params.shareToken, dependencies);
      }
      item.isCompleted = isCompleted;
      item.contents = item.contents?.map((content) => {
        if (content.type !== 'subItems') {
          return content;
        }

        return {
          ...content,
          subItems: setSubItemsCompletion(content.subItems, isCompleted),
        };
      });

      return saveToggledRun(nextRun, true, params.shareToken, dependencies);
    }
  }

  return { kind: 'not_found' };
};

export const toggleRunSubItem = async (
  params: ToggleRunSubItemParams,
  dependencies: RunExecutionDependencies,
): Promise<RunExecutionActionResult> => {
  if (!params.run) {
    return { kind: 'not_found' };
  }
  if (params.run.status === 'completed') {
    return { kind: 'error', message: COMPLETED_RUN_FROZEN_MESSAGE };
  }

  const nextRun = withClonedRun(params.run);

  for (const section of nextRun.sections) {
    for (const item of section.items) {
      if (item.id !== params.itemId || !item.contents) {
        continue;
      }

      const subItem = findRunSubItem(item, params);
      if (!subItem) {
        return { kind: 'not_found' };
      }

      if ((subItem.isCompleted === true) === params.isCompleted) {
        return saveToggledRun(params.run, false, params.shareToken, dependencies);
      }
      subItem.isCompleted = params.isCompleted;
      item.isCompleted = areItemSubItemsCompleted(item);

      return saveToggledRun(nextRun, true, params.shareToken, dependencies);
    }
  }

  return { kind: 'not_found' };
};

export const saveRunItemNotes = async (
  params: SaveRunItemNotesParams,
  dependencies: RunExecutionDependencies,
): Promise<RunExecutionActionResult> => {
  if (!params.run) {
    return { kind: 'not_found' };
  }

  const nextRun = withClonedRun(params.run);
  for (const section of nextRun.sections) {
    const item = section.items.find((candidate) => candidate.id === params.itemId);
    if (!item) continue;

    item.notes = params.notes;
    try {
      return {
        kind: 'ok',
        run: await persistRun(
          { run: nextRun, shareToken: params.shareToken },
          dependencies,
        ),
      };
    } catch (error) {
      return toErrorResult(error, 'Unable to save task notes.');
    }
  }

  return { kind: 'not_found' };
};

export const saveRunExecutionTitle = async (
  params: SaveRunTitleParams,
  dependencies: RunExecutionDependencies,
): Promise<RunExecutionActionResult> => {
  if (!params.run) {
    return { kind: 'not_found' };
  }

  if (params.shareToken) {
    return { kind: 'shared_disabled' };
  }

  const title = params.title.trim();
  const titleError = getRunTitleError(title);
  if (titleError) return { kind: 'error', message: titleError };
  if (!isRunTitleChange(title, params.run.title)) {
    return { kind: 'ok', run: params.run };
  }

  try {
    const persistedRun = await persistRun(
      {
        includeTitle: true,
        run: {
          ...params.run,
          title,
        },
      },
      dependencies,
    );

    return { kind: 'ok', run: persistedRun };
  } catch (error) {
    return toErrorResult(error, 'Unable to update the run title.');
  }
};

export const completeRunExecution = async (
  params: CompleteRunExecutionParams,
  dependencies: RunExecutionDependencies,
): Promise<RunExecutionActionResult> => {
  if (!params.run) {
    return { kind: 'not_found' };
  }

  if (params.run.status === 'completed') {
    return { kind: 'ok', run: params.run };
  }
  if (!areAllRunItemsCompleted(params.run)) {
    return { kind: 'error', message: 'Finish every task before completing the run.' };
  }

  const completedRun: ChecklistRun = {
    ...applyNoteDrafts(params.run, params.noteDrafts ?? {}),
    completedAt: params.completedAt ?? new Date().toISOString(),
    progress: 100,
    status: 'completed',
  };

  try {
    const persistedRun = await persistRun(
      { run: completedRun, shareToken: params.shareToken },
      dependencies,
    );

    return { kind: 'ok', run: persistedRun };
  } catch (error) {
    return toErrorResult(error, 'Unable to save completion.');
  }
};

export const bindRunSaves = ({ dependencies, noteDrafts, shareToken }: {
  dependencies: RunExecutionDependencies;
  noteDrafts: () => NoteDrafts;
  shareToken?: string | undefined;
}) => ({
  complete: {
    bind: (current: ChecklistRun): RunSave => ({
      canRetryOn: (fresh) => !draftedNotesChanged(noteDrafts(), current, fresh),
      save: (run) => completeRunExecution({ noteDrafts: noteDrafts(), run, shareToken }, dependencies),
    }),
    key: 'complete',
  } satisfies QueuedRunSave,
  notes: (itemId: string, notes: string): QueuedRunSave => ({
    bind: (current) => ({
      canRetryOn: (fresh) => !draftedNotesChanged({ [itemId]: notes }, current, fresh),
      save: (run) => saveRunItemNotes({ itemId, notes, run, shareToken }, dependencies),
    }),
    key: `notes:${itemId}:${notes}`,
  }),
  share: {
    bind: (): RunSave => ({ save: (run) => createRunExecutionShare({ run, shareToken }, dependencies) }),
    key: 'share',
  } satisfies QueuedRunSave,
  stopSharing: {
    bind: (): RunSave => ({ save: (run) => stopRunExecutionSharing({ run, shareToken }, dependencies) }),
    key: 'stop-sharing',
  } satisfies QueuedRunSave,
  title: (title: string): QueuedRunSave => ({
    bind: (current) => ({
      canRetryOn: (fresh) => fresh.title === current.title,
      save: (run) => saveRunExecutionTitle({ run, shareToken, title }, dependencies),
    }),
    key: `title:${title}`,
  }),
  toggleItem: (itemId: string, isCompleted: boolean): QueuedRunSave => ({
    bind: (current) => ({
      canRetryOn: (fresh) => !draftedNotesChanged(noteDrafts(), current, fresh, [itemId]),
      save: (run) => toggleRunItem({ isCompleted, itemId, noteDrafts: noteDrafts(), run, shareToken }, dependencies),
    }),
    key: `toggle:${itemId}:${isCompleted}`,
  }),
  toggleSubItem: (itemId: string, contentIndex: number, subItemIndex: number, isCompleted: boolean): QueuedRunSave => ({
    bind: (current) => {
      const item = getSelectedRunItem(current, itemId)?.item;
      const subItemId = item && findRunSubItem(item, { contentIndex, subItemIndex })?.id;
      const target = { contentIndex, isCompleted, itemId, subItemId, subItemIndex };
      return { save: (run) => toggleRunSubItem({ ...target, run, shareToken }, dependencies) };
    },
    key: `toggle:${itemId}:${contentIndex}:${subItemIndex}:${isCompleted}`,
  }),
});
