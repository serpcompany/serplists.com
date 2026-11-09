import { describe, expect, it, vi } from 'vitest';

import type { RunExecutionActionResult } from '@/features/run-execution/runExecutionResult';
import { createRunSaver, type QueuedRunSave, type RunSaverContext } from '@/features/run-execution/runSaver';

import { buildRun } from '../../../fixtures/runExecutionFixtures';

const conflict: RunExecutionActionResult = { kind: 'error', code: 'edit_conflict', message: 'Checklist run changed since it was loaded.' };

const aSave = (result: RunExecutionActionResult) => {
  const save = vi.fn(async (): Promise<RunExecutionActionResult> => result);
  const queued: QueuedRunSave = { bind: () => ({ save }), key: 'notes:item-1:Hello' };
  return { queued, save };
};

const pageContext = (overrides: Partial<RunSaverContext>): RunSaverContext => ({
  apply: (result) => result,
  latest: () => buildRun(),
  onNotFound: vi.fn(),
  reload: async () => ({ kind: 'ok', mode: 'private', run: buildRun({ revision: 2 }), selectedItemId: null }),
  ...overrides,
});

describe('a save on a run page whose run is not there to save', () => {
  it('sends nothing before the run has loaded', async () => {
    const { queued, save } = aSave({ kind: 'ok' });

    expect(await createRunSaver()(queued, pageContext({ latest: () => null }))).toEqual({ kind: 'not_found' });
    expect(save).not.toHaveBeenCalled();
  });

  it('reports the conflict, without a retry, when the run cannot be reloaded after it', async () => {
    const { queued, save } = aSave(conflict);
    const onNotFound = vi.fn();
    const reload = vi.fn(async (): ReturnType<RunSaverContext['reload']> => ({ kind: 'error', mode: 'private', message: 'Offline' }));

    const result = await createRunSaver()(queued, pageContext({ onNotFound, reload }));

    expect(result).toEqual(conflict);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(onNotFound).not.toHaveBeenCalled();
  });
});
