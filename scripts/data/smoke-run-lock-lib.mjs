import { mkdirSync, lstatSync, rmdirSync } from "node:fs";
import path from "node:path";

export async function acquireSmokeRunLock({
  lockPath,
  maxWaitMs = 180_000,
  pollMs = 250,
  now = () => Date.now(),
  wait = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
}) {
  const startedAt = now();
  mkdirSync(path.dirname(lockPath), { recursive: true });
  while (true) {
    try {
      mkdirSync(lockPath);
      const owned = lstatSync(lockPath);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const current = lstatSync(lockPath);
        if (!current.isDirectory() || current.dev !== owned.dev || current.ino !== owned.ino || current.birthtimeMs !== owned.birthtimeMs) {
          throw new Error("Smoke lock ownership changed before release.");
        }
        // Never recursively remove unexpected contents, even inside our lock.
        rmdirSync(lockPath);
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      // Age is not ownership: a long-running owner may still hold this lock.
      if (now() - startedAt >= maxWaitMs) {
        throw new Error(`Timed out waiting for the repository smoke lock: ${lockPath}`);
      }
      await wait(pollMs);
    }
  }
}
