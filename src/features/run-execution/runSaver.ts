import type { ChecklistRun } from '@/types/checklist';

import type { RunExecutionActionResult, RunExecutionLoadResult } from './runExecutionResult';
import { createSaveQueue } from './saveQueue';

export const RUN_CHANGED_ELSEWHERE_MESSAGE =
  'This run was changed somewhere else. The latest version is shown now; check it and try again.';

export type RunSave = {
  canRetryOn?: (fresh: ChecklistRun) => boolean;
  save: (run: ChecklistRun) => Promise<RunExecutionActionResult>;
};

export type QueuedRunSave = {
  bind: (current: ChecklistRun) => RunSave;
  key: string;
};

export type RunSaverContext = {
  apply: (result: RunExecutionActionResult) => RunExecutionActionResult;
  latest: () => ChecklistRun | null;
  onNotFound: () => void;
  reload: () => Promise<RunExecutionLoadResult>;
};

const isEditConflict = (result: RunExecutionActionResult): boolean =>
  result.kind === 'error' && result.code === 'edit_conflict';

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
