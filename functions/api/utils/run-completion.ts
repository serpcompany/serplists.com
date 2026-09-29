import { findOpenRunTasks } from './template-reconciliation';

// Completion attribution for checklist runs (web PUT, share-link PUT and MCP set_run_status).
//
// The run page sends the run's current status with every save, so a rename, a tick or a
// note on a completed run arrives as status 'completed' again. Only a real transition into
// completed names the completer and dates the completion; later saves keep both, whoever
// makes them. Reopening keeps them too: only revalidation clears them.

export interface RunCompletionRefusal {
  message: string;
  openTaskIds: string[];
}

/**
 * Why a run cannot become completed, or null when it can: it needs tasks, and none of them
 * may be open (findOpenRunTasks), the rule the run page's Complete run follows. The page
 * freezes a completed run, so open work could never be finished. MCP set_run_status and the
 * share-link PUT refuse with `run_incomplete`. Check only a run becoming completed: saving one
 * already completed (even an older one with open work) must keep working.
 */
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
  /** The status the save asks for; undefined when it leaves the status alone. */
  nextStatus: unknown;
  /** A completion time from the client, honored only when the run becomes completed. */
  requestedCompletedAt?: string | null;
  /** Who completes the run; null for a share-link guest, who is never named. */
  userId: string | null;
  now: string;
}

export interface CompletionStamps {
  completed_at?: string;
  // Null when a guest completes it, so the previous completer of a reopened run is not kept.
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

  // Already completed. A legacy row without a date gets one once, so the date stops moving
  // on later saves; nobody is named, because the completer is unknown.
  return input.currentCompletedAt ? {} : { completed_at: input.now };
}
