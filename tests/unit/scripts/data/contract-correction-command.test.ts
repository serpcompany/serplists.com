import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("contract-correction command", () => {
  it("accepts only the fingerprinted already-applied correction files", () => {
    const temp = mkdtempSync(path.join(tmpdir(), "contract-correction-"));
    try {
      const changed = path.join(temp, "changed.txt");
      writeFileSync(changed, "db/schema/auth.ts\n");
      const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "tsx", "scripts/data/check-contract-correction.ts", "--changed-files-file", changed, "--report-dir", temp], { cwd: process.cwd(), encoding: "utf8" });
      const retried = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "tsx", "scripts/data/check-contract-correction.ts", "--changed-files-file", changed, "--base-ref", "HEAD", "--report-dir", temp], { cwd: process.cwd(), encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(retried.status).toBe(0);
      expect(JSON.parse(readFileSync(path.join(temp, "contract-correction.json"), "utf8")).verdict).toBe("pass");
    } finally { rmSync(temp, { recursive: true, force: true }); }
  }, 20_000);

  it.each(["pull_request", "push", "workflow_dispatch"])("records a trustworthy %s comparison base", (eventName) => {
    const temp = mkdtempSync(path.join(tmpdir(), "contract-event-base-"));
    try {
      const changed = path.join(temp, "changed.txt");
      writeFileSync(changed, "db/schema/auth.ts\n");
      const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "tsx", "scripts/data/check-contract-correction.ts", "--changed-files-file", changed, "--base-ref", "HEAD", "--report-dir", temp], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: eventName } });
      expect(result.status).toBe(0);
      expect(JSON.parse(readFileSync(path.join(temp, "contract-correction.json"), "utf8"))).toMatchObject({ eventName, comparisonBase: "HEAD" });
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });

  it("fails when a supplied base ref is missing or shallow", () => {
    const temp = mkdtempSync(path.join(tmpdir(), "contract-missing-base-"));
    try {
      const changed = path.join(temp, "changed.txt");
      writeFileSync(changed, "db/schema/auth.ts\n");
      const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "tsx", "scripts/data/check-contract-correction.ts", "--changed-files-file", changed, "--base-ref", "refs/remotes/origin/missing-shallow-base", "--report-dir", temp], { cwd: process.cwd(), encoding: "utf8" });
      expect(result.status).toBe(1);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });

  it.each([
    ["bogus mapping", (manifest: any) => { manifest.properties[0].table = "missing_table"; }],
    ["bogus value", (manifest: any) => { manifest.properties[0].expectedValue = "wrong"; }],
    ["bogus migration", (manifest: any) => { manifest.properties[0].creatingMigration = "9999_new_in_pr.sql"; }],
    ["later non-creating migration", (manifest: any) => { manifest.properties[0].creatingMigration = "0024_safe_template_evolution.sql"; }],
  ])("fails end-to-end for %s", (_name, mutate) => {
    const temp = mkdtempSync(path.join(tmpdir(), "contract-correction-bogus-"));
    try {
      const changed = path.join(temp, "changed.txt");
      const manifestPath = path.join(temp, "manifest.json");
      writeFileSync(changed, "db/schema/auth.ts\n");
      const manifest = JSON.parse(readFileSync("scripts/data/contract-corrections.json", "utf8"));
      mutate(manifest);
      writeFileSync(manifestPath, JSON.stringify(manifest));
      const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "tsx", "scripts/data/check-contract-correction.ts", "--changed-files-file", changed, "--manifest", manifestPath, "--base-ref", "HEAD", "--report-dir", temp], { cwd: process.cwd(), encoding: "utf8" });
      expect(result.status).toBe(1);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });

  it("fails end-to-end for an unmapped Drizzle-only database change", () => {
    const temp = mkdtempSync(path.join(tmpdir(), "contract-correction-reject-"));
    try {
      const changed = path.join(temp, "changed.txt");
      writeFileSync(changed, "db/schema/newRuntimeTable.ts\n");
      const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "tsx", "scripts/data/check-contract-correction.ts", "--changed-files-file", changed, "--base-ref", "HEAD", "--report-dir", temp], { cwd: process.cwd(), encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(JSON.parse(readFileSync(path.join(temp, "contract-correction.json"), "utf8"))).toMatchObject({ verdict: "fail", error: expect.stringMatching(/outside.*manifest/i) });
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });
});
