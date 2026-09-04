import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runRepositoryGit, sanitizedGitEnvironment } from "../../../../scripts/data/git-subprocess-env.mjs";

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

  it("binds contract base, HEAD, cleanliness, and reports to the intended cwd despite poisoned Git variables", () => {
    const temp = mkdtempSync(path.join(tmpdir(), "contract-poisoned-git-"));
    try {
      const poison = path.join(temp, "poison");
      execFileSync("git", ["init", "-q", poison], { env: sanitizedGitEnvironment() });
      writeFileSync(path.join(poison, "poison.txt"), "poison");
      runRepositoryGit({ repoRoot: poison, args: ["add", "poison.txt"] });
      runRepositoryGit({ repoRoot: poison, args: ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "poison"] });
      const changed = path.join(temp, "changed.txt");
      writeFileSync(changed, "db/schema/auth.ts\n");
      const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "tsx", "scripts/data/check-contract-correction.ts", "--changed-files-file", changed, "--base-ref", "HEAD", "--report-dir", temp], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, GIT_DIR: path.join(poison, ".git"), GIT_WORK_TREE: poison, GIT_INDEX_FILE: path.join(poison, ".git/index") } });
      expect(result.status, result.stderr).toBe(0);
      const report = JSON.parse(readFileSync(path.join(temp, "contract-correction.json"), "utf8"));
      const intendedState = { commit: runRepositoryGit({ repoRoot: process.cwd(), args: ["rev-parse", "HEAD"] }).trim(), paths: runRepositoryGit({ repoRoot: process.cwd(), args: ["status", "--porcelain", "--untracked-files=all"] }).split(/\r?\n/).filter(Boolean).map((line) => line.slice(3)) };
      const intendedHead = intendedState.commit;
      expect(report).toMatchObject({ verdict: "pass", commit: intendedHead, startCommit: intendedHead, endCommit: intendedHead, repositoryRoot: process.cwd(), comparisonBase: "HEAD" });
      expect(report.workingTreePaths).toEqual(intendedState.paths);
      expect(report.workingTreePaths).not.toContain("poison.txt");
    } finally { rmSync(temp, { recursive: true, force: true }); }
  }, 20_000);

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
