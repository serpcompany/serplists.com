export type SingleFlight = {
  isRunning: () => boolean;
  /** Runs the task, or resolves to undefined without running it while another is running. */
  run: <T>(task: () => Promise<T> | T) => Promise<T | undefined>;
};

/**
 * Runs one task at a time and drops calls made while one is running, such as a double
 * click or a repeated Enter. The guard is set synchronously, so a second click wins no
 * race against React re-rendering a disabled button, and it is cleared however the task
 * ends: success, early return, or error.
 */
export function createSingleFlight(onRunningChange?: (running: boolean) => void): SingleFlight {
  let running = false;

  return {
    isRunning: () => running,
    run: async (task) => {
      if (running) return undefined;
      running = true;
      onRunningChange?.(true);
      try {
        return await task();
      } finally {
        running = false;
        onRunningChange?.(false);
      }
    },
  };
}
