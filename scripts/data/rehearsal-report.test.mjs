import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateSanitizedRehearsalArtifact } from "./sanitizer-lib.mjs";
import { resolveRehearsalPlan } from "./rehearsal-plan-lib.mjs";

const repoRoot = new URL("../..", import.meta.url).pathname;
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
const sourceId = "11111111-1111-4111-8111-111111111111";
const recoveryId = "22222222-2222-4222-8222-222222222222";
const migration = "0024_safe_template_evolution.sql";
const plan = resolveRehearsalPlan({ repoRoot, commit, migrationFrom: migration, migrationTo: migration });

describe("rehearsal report finalization", () => {
  it("binds JSON, human, and JUnit reports to the exact rehearsal and recovery evidence", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "rehearsal-report-"));
    try {
      const now = new Date();
      const artifact = generateSanitizedRehearsalArtifact({
        repoRoot,
        rawExport: readFileSync(path.join(repoRoot, "scripts/data/fixtures/production-export-edge-cases.sql"), "utf8"),
        sourceDatabaseId: "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1",
        sourceDate: now.toISOString().slice(0, 10), gitCommit: commit, issueNumber: 95,
        requestedApproverIdentity: "@devinschumacher", generatedAt: now,
        retentionDeadline: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(),
      });
      const files = Object.fromEntries(["source", "comparison", "recovery", "teardown", "sanitized", "manifest", "output"].map((name) => [name, path.join(directory, name === "output" ? "report.json" : name)]));
      writeFileSync(files.source, JSON.stringify({ verdict: "pass", commit, target: { environment: "local", binding: "DB", databaseName: "local", databaseId: "local:test" }, migrationRange: { from: migration, to: migration }, coverage: { verdict: "pass", planId: plan.id, fixtureProfile: plan.fixtureProfile, affectedTables: plan.affectedTables, invariants: plan.invariants, declarationSha256: plan.declarationSha256 }, authenticatedRehearsal: { verdict: "pass", commit, target: { environment: "local" }, sanitizerArtifactSha256: artifact.manifest.artifact.sha256, migrationRange: { from: migration, to: migration }, checks: { templateRead: true, runRead: true, templateWrite: true, runWrite: true, falseEmptyDetection: "pass", apiErrorDetection: "pass" } }, teardown: { verdict: "pass" } }));
      writeFileSync(files.comparison, JSON.stringify({ verdict: "pass", check: "remote-invariant-comparison", comparisonKind: "migration", commit, target: { environment: "rehearsal", binding: "DB", databaseName: "source-rehearsal", databaseId: sourceId }, migrationRange: { from: migration, to: migration }, ledger: { verdict: "pass" } }));
      writeFileSync(files.recovery, JSON.stringify({ verdict: "pass", commit, environment: "rehearsal", sourceDatabase: { name: "source-rehearsal", id: sourceId }, recoveryDatabase: { name: "recovery-rehearsal", id: recoveryId }, migration: { from: migration, to: migration, appliedThrough: migration, ledgerSha256: "b".repeat(64) }, sanitizer: { version: artifact.manifest.sanitizerVersion, artifactSha256: artifact.manifest.artifact.sha256 }, creation: { verdict: "pass", runId: "123", sourceEvidenceSha256: "e".repeat(64), recoveryEvidenceSha256: "f".repeat(64) }, import: { verdict: "pass" }, invariants: { verdict: "pass", evidenceSha256: "c".repeat(64), domainDigest: "d".repeat(64) }, absence: { verdict: "pass" }, rawPlaintextRetained: false }));
      writeFileSync(files.teardown, "PASS rehearsal source-rehearsal is absent.\nPASS rehearsal recovery-rehearsal is absent.\n");
      writeFileSync(files.sanitized, artifact.sql); writeFileSync(files.manifest, JSON.stringify(artifact.manifest));
      const args = ["scripts/data/finalize-rehearsal-report.mjs", "--source", files.source, "--comparison", files.comparison, "--recovery", files.recovery, "--teardown", files.teardown, "--sanitized", files.sanitized, "--sanitizer-manifest", files.manifest, "--commit", commit, "--database-name", "source-rehearsal", "--database-id", sourceId, "--recovery-database-id", recoveryId, "--migration-from", migration, "--migration-to", migration, "--output", files.output];
      execFileSync(process.execPath, args, { cwd: repoRoot });
      expect(JSON.parse(readFileSync(files.output, "utf8"))).toMatchObject({ commit, target: { environment: "rehearsal", databaseId: sourceId }, migrationRange: { from: migration, to: migration }, coverage: { planId: "safe-template-evolution-0024", declarationSha256: plan.declarationSha256 }, authenticatedRehearsal: { verdict: "pass", sanitizerArtifactSha256: artifact.manifest.artifact.sha256, checks: { templateRead: true, runWrite: true, falseEmptyDetection: "pass", apiErrorDetection: "pass" } }, sanitizedSource: { sanitizerVersion: "source-derived-shape-v2", accessOwner: "@devinschumacher" }, recovery: { recoveryDatabase: { id: recoveryId } } });
      for (const text of [readFileSync(files.output.replace(".json", ".md"), "utf8"), readFileSync(files.output.replace(".json", ".junit.xml"), "utf8")]) for (const value of [commit, sourceId, recoveryId, migration, "source-derived-shape-v2"]) expect(text).toContain(value);

      const failed = spawnSync(process.execPath, args.map((value) => value === commit ? "f".repeat(40) : value), { cwd: repoRoot, encoding: "utf8" });
      expect(failed.status).toBe(1);
      for (const extension of ["json", "md", "junit.xml"]) expect(readFileSync(path.join(directory, `rehearsal-promotion.${extension}`), "utf8")).toContain("f".repeat(40));
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
