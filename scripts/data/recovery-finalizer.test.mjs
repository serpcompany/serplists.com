import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateSanitizedRehearsalArtifact } from "./sanitizer-lib.mjs";

const repoRoot = new URL("../..", import.meta.url).pathname;
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
const sourceId = "11111111-1111-4111-8111-111111111111";
const recoveryId = "22222222-2222-4222-8222-222222222222";
const migration = "0024_safe_template_evolution.sql";

describe("recovery finalizer evidence binding", () => {
  it("accepts only exact commit, identities, range, ledger, domain digest, sanitizer, creation, and teardown", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "recovery-finalizer-"));
    try {
      const now = new Date();
      const manifest = generateSanitizedRehearsalArtifact({ repoRoot, rawExport: readFileSync(path.join(repoRoot, "scripts/data/fixtures/production-export-edge-cases.sql"), "utf8"), sourceDatabaseId: "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1", sourceDate: now.toISOString().slice(0, 10), gitCommit: commit, issueNumber: 95, requestedApproverIdentity: "@devinschumacher", generatedAt: now, retentionDeadline: new Date(now.getTime() + 3600000).toISOString() }).manifest;
      const files = Object.fromEntries(["comparison", "manifest", "sourceCreation", "recoveryCreation", "teardown", "raw", "output"].map((name) => [name, path.join(directory, name)]));
      const domainDigest = "a".repeat(64); const ledgerDigest = "b".repeat(64);
      writeFileSync(files.comparison, JSON.stringify({ check: "remote-invariant-comparison", verdict: "pass", comparisonKind: "recovery", commit, target: { environment: "rehearsal", binding: "DB", databaseName: "recovery-db", databaseId: recoveryId }, sourceTarget: { environment: "rehearsal", binding: "DB", databaseName: "source-db", databaseId: sourceId }, migrationRange: { from: migration, to: migration }, ledger: { verdict: "pass", appliedThrough: migration, afterSha256: ledgerDigest }, preDomainDigest: domainDigest, postDomainDigest: domainDigest }));
      writeFileSync(files.manifest, JSON.stringify(manifest));
      writeFileSync(files.sourceCreation, JSON.stringify({ verdict: "pass", commit, runId: "123", target: { databaseName: "source-db", databaseId: sourceId } }));
      writeFileSync(files.recoveryCreation, JSON.stringify({ verdict: "pass", commit, runId: "123", target: { databaseName: "recovery-db", databaseId: recoveryId } }));
      writeFileSync(files.teardown, "PASS rehearsal source-db is absent.\nPASS rehearsal recovery-db is absent.\n");
      const args = ["scripts/data/finalize-recovery-rehearsal.mjs", "--comparison", files.comparison, "--sanitizer-manifest", files.manifest, "--source-creation", files.sourceCreation, "--recovery-creation", files.recoveryCreation, "--teardown", files.teardown, "--raw", files.raw, "--source-database-name", "source-db", "--source-database-id", sourceId, "--recovery-database-name", "recovery-db", "--recovery-database-id", recoveryId, "--commit", commit, "--environment", "rehearsal", "--migration-from", migration, "--migration-to", migration, "--output", files.output];
      execFileSync(process.execPath, args, { cwd: repoRoot });
      expect(JSON.parse(readFileSync(files.output, "utf8"))).toMatchObject({ verdict: "pass", commit, sourceDatabase: { id: sourceId }, recoveryDatabase: { id: recoveryId }, migration: { ledgerSha256: ledgerDigest }, creation: { verdict: "pass" }, invariants: { domainDigest } });
      writeFileSync(files.comparison, JSON.stringify({ verdict: "pass" }));
      expect(spawnSync(process.execPath, args, { cwd: repoRoot }).status).toBe(1);
      for (const name of ["recovery-rehearsal.json", "recovery-rehearsal.md", "recovery-rehearsal.junit.xml"]) expect(readFileSync(path.join(directory, name), "utf8")).toContain(commit);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
