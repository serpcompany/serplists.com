import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { privacySafeLedgerProjection } from "./ledger-reporting-lib.mjs";

const providerSentinels = [
  "PROVIDER_STDOUT_PRIVATE_SENTINEL_128",
  "PROVIDER_STDERR_PRIVATE_SENTINEL_128",
  "9999_PRIVATE_LEDGER_SENTINEL_128.sql",
];
const databaseName = "serp-checklists-db";
const databaseId = "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1";

function expectPrivateFree(text) {
  for (const sentinel of providerSentinels) expect(text).not.toContain(sentinel);
}

function providerFixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "issue-128-provider-privacy-"));
  const fakePnpm = path.join(directory, "pnpm");
  writeFileSync(fakePnpm, `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes('info')) {
  process.stdout.write(JSON.stringify({name:${JSON.stringify(databaseName)},uuid:${JSON.stringify(databaseId)}}));
  process.exit(0);
}
process.stdout.write(${JSON.stringify(providerSentinels[0])});
process.stderr.write(${JSON.stringify(providerSentinels.slice(1).join(" "))});
process.exit(31);
`);
  chmodSync(fakePnpm, 0o700);
  return directory;
}

describe.skipIf(process.platform === "win32")("issue 128 provider and ledger privacy boundaries", () => {
  it("projects unknown ledger entries as count/digest/status while retaining only repository-known names", () => {
    const projection = privacySafeLedgerProjection({
      repositoryMigrations: ["0001_known.sql", "0002_known.sql"],
      observedMigrations: ["0001_known.sql", providerSentinels[2]],
    });
    expect(projection).toMatchObject({
      status: "drift",
      observedCount: 2,
      unknownCount: 1,
      knownMigrations: ["0001_known.sql"],
      appliedThrough: "0001_known.sql",
    });
    expect(projection.observedSha256).toMatch(/^[0-9a-f]{64}$/);
    expectPrivateFree(JSON.stringify(projection));
  });

  it("redacts pending-migration provider stdout/stderr in JSON, JUnit, text, markdown, and console while retaining exit status", () => {
    const directory = providerFixture();
    const reports = path.join(directory, "reports");
    try {
      const result = spawnSync(process.execPath, [
        "scripts/data/check-pending-migrations.mjs",
        "--database", databaseName,
        "--database-id", databaseId,
        "--label", "production",
        "--remote",
        "--report-dir", reports,
      ], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, PATH: `${directory}:${process.env.PATH}` } });
      expect(result.status).toBe(1);
      const contents = [result.stdout, result.stderr, ...readdirSync(reports).map((name) => readFileSync(path.join(reports, name), "utf8"))];
      for (const content of contents) expectPrivateFree(content);
      const report = JSON.parse(readFileSync(path.join(reports, "pending-migrations-production.json"), "utf8"));
      expect(report).toMatchObject({ verdict: "fail", failedStage: "pending-migrations-command", errorCode: "CANARY_SUBPROCESS_FAILED", exitStatus: 31 });
      expect(readFileSync(path.join(reports, "pending-migrations-production.junit.xml"), "utf8")).toMatch(/failures="[1-9][0-9]*"/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("redacts direct production identity-bound provider stdout/stderr from console and preserves the subprocess status", () => {
    const directory = providerFixture();
    try {
      const result = spawnSync(process.execPath, [
        "scripts/data/production-identity-bound-command.mjs", "sanitizer-export",
        "--database-name", databaseName,
        "--database-id", databaseId,
        "--output", "tmp/production-sensitive/source.sql",
        "--evidence", "tmp/data-evidence/source.identity.json",
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          GITHUB_ACTIONS: "true",
          GITHUB_REPOSITORY: "serpcompany/serplists.com",
          GITHUB_REF_PROTECTED: "true",
          GITHUB_EVENT_NAME: "workflow_dispatch",
          DATA_PROMOTION_WORKFLOW: "data-promotion",
          GITHUB_REF: "refs/heads/main",
          DATA_PROTECTED_ENVIRONMENT: "production",
          GITHUB_SHA: spawnSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8" }).stdout.trim(),
          GITHUB_RUN_ID: "128",
          CLOUDFLARE_API_TOKEN: "fixture-token",
        },
      });
      expect(result.status).toBe(1);
      expectPrivateFree(result.stdout + result.stderr);
      expect(result.stderr).toContain("production-identity-bound-command");
      expect(result.stderr).toContain("CANARY_SUBPROCESS_FAILED");
      expect(result.stderr).toContain('"exitStatus":31');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
