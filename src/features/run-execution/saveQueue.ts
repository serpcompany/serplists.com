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
