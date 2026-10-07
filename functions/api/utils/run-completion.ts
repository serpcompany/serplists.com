import { findOpenRunTasks } from './template-reconciliation';

export interface RunCompletionRefusal {
  message: string;
  openTaskIds: string[];
}

export function findRunCompletionRefusal(sections: unknown[]): RunCompletionRefusal | null {
  const { total, open } = findOpenRunTasks(sections);
  if (total > 0 && open.length === 0) return null;
  return {
    message: total === 0 ? 'This run has no tasks to complete' : 'Finish every task and Sub-task before completing the run',
    openTaskIds: open,
  };
}

export interface CompletionStampInput {
  currentStatus: unknown;
  currentCompletedAt: unknown;
  nextStatus: unknown;
  requestedCompletedAt?: string | null | undefined;
  userId: string | null;
  now: string;
}

export interface CompletionStamps {
  completed_at?: string;
  completed_by_user_id?: string | null;
}

export function completionStamps(input: CompletionStampInput): CompletionStamps {
  if (input.nextStatus !== 'completed') return {};

  if (input.currentStatus !== 'completed') {
    return {
      completed_at: input.requestedCompletedAt ?? input.now,
      completed_by_user_id: input.userId,
    };
  }

  const legacyCompletedRowWithoutDate = !input.currentCompletedAt;
  return legacyCompletedRowWithoutDate ? { completed_at: input.now } : {};
}
