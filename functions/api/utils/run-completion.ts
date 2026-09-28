// Completion attribution for checklist runs (web PUT and MCP set_run_status).
//
// The run page sends the run's current status with every save, so a rename, a tick or a
// note on a completed run arrives as status 'completed' again. Only a real transition into
// completed names the completer and dates the completion; later saves keep both, whoever
// makes them. Reopening keeps them too: only revalidation clears them.

export interface CompletionStampInput {
  currentStatus: unknown;
  currentCompletedAt: unknown;
  /** The status the save asks for; undefined when it leaves the status alone. */
  nextStatus: unknown;
  /** A completion time from the client, honored only when the run becomes completed. */
  requestedCompletedAt?: string | null;
  userId: string;
  now: string;
}

export interface CompletionStamps {
  completed_at?: string;
  completed_by_user_id?: string;
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
