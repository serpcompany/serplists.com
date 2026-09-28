/**
 * Runs an Organization settings change and the refreshes that follow it.
 * Only a failed write is reported as a failure: once the write resolves the
 * change is saved, so a refresh that fails afterwards (for example GET
 * /api/teams during a brief outage) is reported separately and never as
 * "Failed to ...". Every refresh runs even if another one fails.
 * Resolves to whether the write was saved.
 */
export async function runTeamWrite<T>({
  write,
  refreshes,
  onSaved,
  onRefreshFailed,
  onWriteFailed,
}: {
  write: () => Promise<T>;
  refreshes: Array<() => Promise<unknown>>;
  onSaved: (result: T) => void;
  onRefreshFailed: (error: unknown) => void;
  onWriteFailed: (error: unknown) => void;
}): Promise<boolean> {
  let result: T;
  try {
    result = await write();
  } catch (error) {
    onWriteFailed(error);
    return false;
  }

  onSaved(result);

  const outcomes = await Promise.allSettled(refreshes.map(async (refresh) => refresh()));
  const failed = outcomes.find(
    (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
  );
  if (failed) {
    onRefreshFailed(failed.reason);
  }

  return true;
}
