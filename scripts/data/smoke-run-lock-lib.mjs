import { mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

export async function acquireSmokeRunLock({
  lockPath,
  maxWaitMs = 180_000,
  staleMs = 10 * 60_000,
  pollMs = 250,
  now = () => Date.now(),
  wait = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
}) {
  const startedAt = now();
  mkdirSync(path.dirname(lockPath), { recursive: true });
  while (true) {
    try {
      mkdirSync(lockPath);
      let released = false;
      return () => {
        if (!released) rmSync(lockPath, { recursive: true, force: true });
        released = true;
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const age = now() - statSync(lockPath).mtimeMs;
      if (age > staleMs) {
        rmSync(lockPath, { recursive: true, force: true });
        continue;
      }
      if (now() - startedAt >= maxWaitMs) {
        throw new Error(`Timed out waiting for the repository smoke lock: ${lockPath}`);
      }
      await wait(pollMs);
    }
  }
}
