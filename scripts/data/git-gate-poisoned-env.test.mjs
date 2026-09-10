import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runRepositoryGit, sanitizedGitEnvironment } from "./git-subprocess-env.mjs";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const intendedCommit = runRepositoryGit({ repoRoot, args: ["rev-parse", "HEAD"] }).trim();

function poisonedEnvironment(root) {
  const poison = path.join(root, "poison");
  execFileSync("git", ["init", "-q", poison], { env: sanitizedGitEnvironment() });
  writeFileSync(path.join(poison, "poison.txt"), "poison");
  runRepositoryGit({ repoRoot: poison, args: ["add", "poison.txt"] });
  runRepositoryGit({ repoRoot: poison, args: ["-c", "core.hooksPath=/dev/null", "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "poison"] });
  return {
    ...process.env,
    SCHEMA_CONTRACT_BASE_SHA: process.env.SCHEMA_CONTRACT_BASE_SHA || runRepositoryGit({ repoRoot, args: ["merge-base", "HEAD", "origin/staging"] }).trim(),
    GIT_DIR: path.join(poison, ".git"),
    GIT_WORK_TREE: poison,
    GIT_INDEX_FILE: path.join(poison, ".git/index"),
  };
}

function runScript(args, env) { return spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "tsx", ...args], { cwd: repoRoot, encoding: "utf8", env }); }

describe("poisoned Git environment isolation across data gates", () => {
  it("binds schema, D1-schema, pending-migration, and contract reports to the intended repository", () => {
    const root = mkdtempSync(path.join(tmpdir(), "poisoned-data-gates-"));
    try {
      const env = poisonedEnvironment(root);
      const schemaDir = path.join(root, "schema");
      const schema = runScript(["scripts/data/check-schema-contract.ts", "--report-dir", schemaDir], env);
      expect(schema.status, schema.stderr).toBe(0);
      expect(JSON.parse(readFileSync(path.join(schemaDir, "schema-contract.json"), "utf8"))).toMatchObject({ commit: intendedCommit, target: { environment: "local", binding: "not-applicable:in-memory", databaseName: "fresh-migration-replay", databaseId: "local:ephemeral" } });
      expect(JSON.parse(readFileSync(path.join(schemaDir, "contract-correction.json"), "utf8"))).toMatchObject({ commit: intendedCommit, repositoryRoot: repoRoot });

      for (const [script, reportName, expectedDatabase] of [["scripts/data/check-d1-schema.ts", "d1-schema-unknown.json", "unknown"], ["scripts/data/check-pending-migrations.mjs", "pending-migrations-unknown.json", "unknown"]]) {
        const reportDir = path.join(root, reportName);
        const result = runScript([script, "--database", "intended-db", "--report-dir", reportDir], env);
        expect(result.status).toBe(1);
        const report = JSON.parse(readFileSync(path.join(reportDir, reportName), "utf8"));
        expect(report).toMatchObject({ commit: intendedCommit, target: { environment: "unknown" } });
        expect(report.target.databaseName ?? report.target.database).toBe(expectedDatabase);
        if (script.endsWith('check-d1-schema.ts')) {
          // Invalid, unobserved configuration is not trusted target evidence.
          expect(report.failedStage).toBe('schema-configuration');
          expect(JSON.stringify(report)).not.toContain('intended-db');
        }
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 20_000);

  it("binds data-command and sanitizer output to the intended commit and target", () => {
    const root = mkdtempSync(path.join(tmpdir(), "poisoned-data-output-"));
    try {
      const env = poisonedEnvironment(root);
      const command = spawnSync(process.execPath, ["scripts/data/data-command.mjs", "identify", "--environment", "local"], { cwd: repoRoot, encoding: "utf8", env });
      expect(command.status, command.stderr).toBe(0);
      expect(command.stdout).toContain(intendedCommit);
      expect(command.stdout).toContain('"databaseName": "serp-checklists-db"');
      const sanitizer = spawnSync(process.execPath, ["scripts/data/sanitize-rehearsal-export.mjs", "--input", "tmp/production-sensitive/not-read.sql", "--output", "tmp/data-evidence/not-written.sql", "--manifest", "tmp/data-evidence/not-written.json", "--source-database-id", "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1", "--source-schema", "0023_add_sitemap_revision_state.sql", "--source-date", "2026-09-05", "--issue", "95", "--approver-identity", "@devinschumacher", "--retention-deadline", "2026-09-06T00:00:00.000Z", "--migration-from", "0024_safe_template_evolution.sql", "--migration-to", "0024_safe_template_evolution.sql"], { cwd: repoRoot, encoding: "utf8", env });
      expect(sanitizer.status, sanitizer.stderr).toBe(0);
      expect(sanitizer.stdout).toContain(intendedCommit);
      expect(sanitizer.stdout).toContain('"databaseName": "serp-checklists-db"');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
