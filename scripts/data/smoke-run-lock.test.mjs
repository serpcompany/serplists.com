import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { acquireSmokeRunLock } from "./smoke-run-lock-lib.mjs";

describe("repository smoke run lock", () => {
  it("serializes concurrent smoke owners before shared Wrangler state is touched", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "smoke-lock-"));
    const lockPath = path.join(root, ".wrangler/smoke-state.lock");
    try {
      const releaseFirst = await acquireSmokeRunLock({ lockPath });
      let waits = 0;
      const releaseSecond = await acquireSmokeRunLock({
        lockPath,
        wait: async () => {
          waits += 1;
          releaseFirst();
        },
      });
      expect(waits).toBe(1);
      releaseSecond();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
