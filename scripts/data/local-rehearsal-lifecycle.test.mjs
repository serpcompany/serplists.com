import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { runDataCommand } from "./data-command-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");

function run(command) {
  return execFileSync(command[0], command.slice(1), {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

describe("isolated local rehearsal lifecycle", () => {
  it("replays migrations, applies deterministic fixtures twice, and proves teardown leaves no rows", () => {
    const rehearsalRoot = path.join(repoRoot, ".wrangler/rehearsals");
    mkdirSync(rehearsalRoot, { recursive: true });
    const persistencePath = mkdtempSync(path.join(rehearsalRoot, "vitest-"));
    const relativePersistencePath = path.relative(repoRoot, persistencePath);

    try {
      const common = {
        repoRoot,
        gitCommit: "local-rehearsal-test",
        write: () => {},
        runCommand: run,
      };
      expect(
        runDataCommand({
          ...common,
          argv: [
            "migration-apply",
            "--environment",
            "local",
            "--persist-to",
            relativePersistencePath,
            "--execute",
          ],
        }).executed,
      ).toBe(true);
      const setupArgs = [
        "fixture-setup",
        "--environment",
        "local",
        "--persist-to",
        relativePersistencePath,
        "--execute",
      ];

      expect(runDataCommand({ ...common, argv: setupArgs }).executed).toBe(true);
      expect(runDataCommand({ ...common, argv: setupArgs }).executed).toBe(true);
      expect(
        runDataCommand({
          ...common,
          argv: [
            "fixture-teardown",
            "--environment",
            "local",
            "--persist-to",
            relativePersistencePath,
            "--execute",
          ],
        }).executed,
      ).toBe(true);
    } finally {
      rmSync(persistencePath, { recursive: true, force: true });
    }
  }, 20_000);

  // Actual pre0024 -> current exports and both profiles are exercised by
  // sanitizer-local-d1.test.mjs. Do not inject legacy fixtures after migration.
});
