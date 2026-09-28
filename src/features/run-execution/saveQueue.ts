// Runs a run page's saves one at a time, in order, so each save starts from the result of
// the one before it and sends the current revision. A key that is already queued or
// running is ignored (resolves to null): that is a double click, and repeating it would
// send a second save, or a second completion that conflicts with the first.
export function createSaveQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  const pending = new Set<string>();

  return <T>(key: string, task: () => Promise<T>): Promise<T | null> => {
    if (pending.has(key)) return Promise.resolve(null);
    pending.add(key);
    const result = tail.then(task).finally(() => pending.delete(key));
    tail = result.catch(() => undefined);
    return result;
  };
}
