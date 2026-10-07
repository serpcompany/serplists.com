export type SingleFlight = {
  isRunning: () => boolean;
  run: <T>(task: () => Promise<T> | T) => Promise<T | undefined>;
};

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
