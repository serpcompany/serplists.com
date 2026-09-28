/**
 * Runs one task at a time and ignores calls made while a task is running
 * (they resolve to undefined without starting anything). A double click on
 * Accept therefore sends one request, and clicking Decline while Accept is
 * pending does nothing.
 */
export function createSingleFlight() {
  let running = false;

  return async <T>(task: () => Promise<T>): Promise<T | undefined> => {
    if (running) {
      return undefined;
    }

    running = true;
    try {
      return await task();
    } finally {
      running = false;
    }
  };
}
