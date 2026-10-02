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
