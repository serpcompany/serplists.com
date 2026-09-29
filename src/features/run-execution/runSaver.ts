import type { ChecklistRun } from '@/types/checklist';

import type { RunExecutionActionResult, RunExecutionLoadResult } from './runExecutionResult';
import { createSaveQueue } from './saveQueue';

export const RUN_CHANGED_ELSEWHERE_MESSAGE =
  'This run was changed somewhere else. The latest version is shown now; check it and try again.';

// One save, bound to the latest run when its turn in the queue comes. `save` runs on that
// run, and once more on a reloaded run after an edit conflict, unless `canRetryOn` says the reload
// changed what it would overwrite (someone else's notes or title).
export type RunSave = {
  canRetryOn?: (fresh: ChecklistRun) => boolean;
  save: (run: ChecklistRun) => Promise<RunExecutionActionResult>;
};

// A save waiting in the queue. `key` names what the user asked for (a toggle includes the
// value they chose), so a double click that repeats it is ignored.
export type QueuedRunSave = {
  bind: (current: ChecklistRun) => RunSave;
  key: string;
};

export type RunSaverContext = {
  // Makes an ok result's run the latest run (and the one on screen).
  apply: (result: RunExecutionActionResult) => RunExecutionActionResult;
  latest: () => ChecklistRun | null;
  onNotFound: () => void;
  // Loads the run again from the API, never from a cache.
  reload: () => Promise<RunExecutionLoadResult>;
};

const isEditConflict = (result: RunExecutionActionResult): boolean =>
  result.kind === 'error' && result.code === 'edit_conflict';

// Runs a run page's saves one at a time through the save queue (saveQueue.ts). When
// another session saved first (409 edit_conflict), it shows that session's version,
// so saves queued behind this one build on it, and retries this save once on it.
// `onSaved` runs once the queue is idle after a save returned ok, with the latest run, so a
// burst of clicks refreshes what reads the saved run (its Changelog) once rather than per click.
export const createRunSaver = (onSaved?: (latest: ChecklistRun | null) => void) => {
  const queue = createSaveQueue();
  let running = 0;
  let saved = false;

  const run = async (
    { bind, key }: QueuedRunSave,
    context: RunSaverContext,
  ): Promise<RunExecutionActionResult> =>
    (await queue(key, async (): Promise<RunExecutionActionResult> => {
      const current = context.latest();
      if (!current) return { kind: 'not_found' };

      const { canRetryOn, save } = bind(current);
      const first = await save(current);
      if (!isEditConflict(first)) return context.apply(first);

      const reloaded = await context.reload();
      if (reloaded.kind === 'not_found') {
        context.onNotFound();
        return { kind: 'not_found' };
      }
      if (reloaded.kind === 'error') return first;

      context.apply({ kind: 'ok', run: reloaded.run });
      if (canRetryOn && !canRetryOn(reloaded.run)) {
        return { kind: 'error', message: RUN_CHANGED_ELSEWHERE_MESSAGE };
      }
      const retried = await save(reloaded.run);
      return context.apply(
        isEditConflict(retried) ? { kind: 'error', message: RUN_CHANGED_ELSEWHERE_MESSAGE } : retried,
      );
    })) ?? { kind: 'ignored' };

  return async (save: QueuedRunSave, context: RunSaverContext): Promise<RunExecutionActionResult> => {
    running += 1;
    try {
      const result = await run(save, context);
      if (result.kind === 'ok') saved = true;
      return result;
    } finally {
      running -= 1;
      if (running === 0 && saved) {
        saved = false;
        onSaved?.(context.latest());
      }
    }
  };
};
