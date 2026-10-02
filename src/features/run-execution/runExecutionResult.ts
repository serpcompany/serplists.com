import { isApiError } from '@/lib/api-errors';
import type { ChecklistRun } from '@/types/checklist';

export type RunExecutionMode = 'private' | 'shared';

export type RunExecutionLoadResult =
  | {
      kind: 'ok';
      mode: RunExecutionMode;
      run: ChecklistRun;
      selectedItemId: string | null;
    }
  | {
      kind: 'error';
      message: string;
      mode: RunExecutionMode;
    }
  | {
      kind: 'not_found';
      mode: RunExecutionMode;
    };

export type RunExecutionActionResult =
  | {
      kind: 'ok';
      run?: ChecklistRun;
      shareUrl?: string;
      shouldPromptComplete?: boolean;
    }
  | {
      kind: 'ignored';
    }
  | {
      kind: 'shared_disabled';
    }
  | {
      kind: 'not_found';
    }
  | {
      kind: 'error';
      message: string;
      code?: string;
    };

export const COMPLETED_RUN_FROZEN_MESSAGE = 'This run is completed, so its tasks can no longer be changed.';

export const toErrorResult = (
  error: unknown,
  fallbackMessage: string,
): RunExecutionActionResult => ({
  kind: 'error',
  message: error instanceof Error ? error.message : fallbackMessage,
  ...(isApiError(error) && error.code ? { code: error.code } : {}),
});
