import { getInitialSelectedItemId } from '@/features/run-execution/runExecutionMappers';
import type { RunExecutionLoadResult } from '@/features/run-execution/runExecutionResult';
import { useRunExecutionModel } from '@/features/run-execution/useRunExecutionModel';
import type { ChecklistRun } from '@/types/checklist';

import { readGuestRun, saveGuestRun } from './guestRunStore';

const loadGuestRun = (templateId: string, opened: ChecklistRun | null): Promise<RunExecutionLoadResult> => {
  const run = readGuestRun(templateId);
  const result: RunExecutionLoadResult =
    run && (!opened || run.id === opened.id)
      ? { kind: 'ok', mode: 'guest', run, selectedItemId: getInitialSelectedItemId(run) }
      : { kind: 'not_found', mode: 'guest' };
  return Promise.resolve(result);
};

export const useGuestRunModel = (templateId: string) =>
  useRunExecutionModel({
    guest: { load: (opened) => loadGuestRun(templateId, opened), templateId },
    updateRun: (run) => Promise.resolve(saveGuestRun(run)),
  });
