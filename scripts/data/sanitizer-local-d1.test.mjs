import { recordIntegrationScenario } from './data-regression-report-lib.mjs';
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const execute = promisify(execFile);
const proof = fileURLToPath(new URL("./run-sanitizer-local-d1-proof.mjs", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

describe("synthetic source exported from real local D1", () => {
  it("exports pre0024 and migrated current data, prepares each profile, and restores actual exports", async () => {
    const result = await execute(process.execPath, [proof], { cwd: repoRoot, encoding: "utf8", timeout: 570_000, maxBuffer: 4 * 1024 * 1024 });
    expect(result.stdout).toContain("PASS actual pre/post0024 source and prepared-target export restores");
    recordIntegrationScenario('rollback-recovery-rehearsal');
  }, 600_000);
});
