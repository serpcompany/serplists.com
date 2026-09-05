import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { acquireSmokeRunLock } from "./smoke-run-lock-lib.mjs";
import { captureWorkspaceMetadata, compareWorkspaceMetadata, evaluateWorkspaceCleanliness } from "./workspace-cleanliness-lib.mjs";

describe("repository smoke run lock", () => {
  it("audits after release without exempting locks or hiding filesystem damage", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "smoke-lock-audit-"));
    const lockPath = path.join(root, ".wrangler/smoke-state.lock");
    try {
      mkdirSync(path.dirname(lockPath));
      writeFileSync(path.join(root, 'retained'), 'before');
      const before = captureWorkspaceMetadata({ repoRoot: root });
      const release = await acquireSmokeRunLock({ lockPath });
      const audit = () => evaluateWorkspaceCleanliness({ paths: [], filesystemChanges: compareWorkspaceMetadata({ before, after: captureWorkspaceMetadata({ repoRoot: root }) }) });
      expect(audit().verdict).toBe('fail');
      release();
      expect(audit().verdict).toBe('pass');
      const releaseNext = await acquireSmokeRunLock({ lockPath });
      release();
      await expect(acquireSmokeRunLock({ lockPath, maxWaitMs: 0 })).rejects.toThrow(/Timed out/);
      releaseNext();
      writeFileSync(path.join(root, 'retained'), 'damaged contents');
      expect(audit().unexpectedFilesystemChanges).toEqual([expect.objectContaining({ path: 'retained', change: 'modified' })]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("refuses to release a replacement lock or remove unexpected contents", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "smoke-lock-replaced-"));
    const lockPath = path.join(root, "lock");
    try {
      const release = await acquireSmokeRunLock({ lockPath });
      renameSync(lockPath, path.join(root, "original"));
      const releaseNext = await acquireSmokeRunLock({ lockPath });
      expect(() => release()).toThrow(/ownership/);
      release();
      expect(existsSync(lockPath)).toBe(true);
      writeFileSync(path.join(lockPath, "foreign"), "retain");
      expect(() => releaseNext()).toThrow();
      expect(readFileSync(path.join(lockPath, "foreign"), "utf8")).toBe("retain");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("never evicts an existing lock merely because it is old", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "smoke-lock-old-"));
    const lockPath = path.join(root, "lock");
    try {
      mkdirSync(lockPath);
      writeFileSync(path.join(lockPath, "retained"), "evidence");
      await expect(acquireSmokeRunLock({ lockPath, maxWaitMs: 0, staleMs: 0, now: () => Date.now() + 60_000 })).rejects.toThrow(/Timed out/);
      expect(readFileSync(path.join(lockPath, "retained"), "utf8")).toBe("evidence");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
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
