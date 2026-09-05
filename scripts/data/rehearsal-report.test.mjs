import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateSanitizedRehearsalArtifact } from "./sanitizer-lib.mjs";
import { resolveRehearsalPlan } from "./rehearsal-plan-lib.mjs";
import { sanitizedState } from "./sanitized-state-lib.mjs";

const repoRoot = new URL("../..", import.meta.url).pathname;
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
const sourceId = "11111111-1111-4111-8111-111111111111";
const recoveryId = "22222222-2222-4222-8222-222222222222";
const migration = "0024_safe_template_evolution.sql";

describe("rehearsal report finalization", () => {
  it.each([migration, "none"])("binds the full recovery/rehearsal report chain for %s", (input) => {
    const migration = input === "none" ? null : input;
    const plan = resolveRehearsalPlan({ repoRoot, commit, migrationFrom: input, migrationTo: input });
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
      writeFileSync(files.source, JSON.stringify({ verdict: "pass", commit, target: { environment: "local", binding: "DB", databaseName: "local", databaseId: "local:test" }, migrationRange: { from: migration, to: migration }, coverage: { verdict: "pass", planId: plan.id, fixtureProfile: plan.fixtureProfile, affectedTables: plan.affectedTables, invariants: plan.invariants, declarationSha256: plan.declarationSha256, artifactSha256: plan.artifactSha256 }, authenticatedRehearsal: { verdict: "pass", commit, target: { environment: "local" }, sanitizerArtifactSha256: artifact.manifest.artifact.sha256, migrationRange: { from: migration, to: migration }, checks: { templateRead: true, runRead: true, templateWriteReadback: true, runWriteReadback: true, falseEmptyDetection: "pass", apiErrorDetection: "pass" } }, teardown: { verdict: "pass" } }));
      writeFileSync(files.comparison, JSON.stringify({ verdict: "pass", check: "remote-invariant-comparison", comparisonKind: "migration", commit, target: { environment: "rehearsal", binding: "DB", databaseName: "source-rehearsal", databaseId: sourceId }, migrationRange: { from: migration, to: migration }, ledger: { verdict: "pass" } }));
      writeFileSync(files.recovery, JSON.stringify({ verdict: "pass", commit, environment: "rehearsal", sourceDatabase: { name: "source-rehearsal", id: sourceId }, recoveryDatabase: { name: "recovery-rehearsal", id: recoveryId }, migration: { from: migration, to: migration, appliedThrough: migration, ledgerSha256: "b".repeat(64) }, sanitizer: { version: artifact.manifest.sanitizerVersion, artifactSha256: artifact.manifest.artifact.sha256 }, creation: { verdict: "pass", runId: "123", sourceEvidenceSha256: "e".repeat(64), recoveryEvidenceSha256: "f".repeat(64) }, import: { verdict: "pass" }, invariants: { verdict: "pass", evidenceSha256: "c".repeat(64), domainDigest: "d".repeat(64) }, absence: { verdict: "pass" }, rawPlaintextRetained: false }));
      writeFileSync(files.teardown, "PASS rehearsal source-rehearsal is absent.\nPASS rehearsal recovery-rehearsal is absent.\n");
      writeFileSync(files.sanitized, artifact.sql); writeFileSync(files.manifest, JSON.stringify(artifact.manifest));
      const { rows: _rows, ...state } = sanitizedState({ templates: [], runs: [], ledger: readdirSync(path.join(repoRoot, "db/migrations")).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort(), sourceSha256: artifact.manifest.artifact.sha256 });
      const source = JSON.parse(readFileSync(files.source, "utf8"));
      Object.assign(source.authenticatedRehearsal, { postMigrationState: state, transformation: { verdict: "pass" }, handlerStateReadback: true });
      writeFileSync(files.source, JSON.stringify(source));
      const comparison = JSON.parse(readFileSync(files.comparison, "utf8"));
      Object.assign(comparison, { sanitizedState: state, ledger: { verdict: "pass", before: migration ? state.ledger.slice(0, -1) : state.ledger, after: state.ledger, afterSha256: state.ledgerSha256 } });
      writeFileSync(files.comparison, JSON.stringify(comparison));
      const args = ["scripts/data/finalize-rehearsal-report.mjs", "--source", files.source, "--comparison", files.comparison, "--recovery", files.recovery, "--teardown", files.teardown, "--sanitized", files.sanitized, "--sanitizer-manifest", files.manifest, "--commit", commit, "--database-name", "source-rehearsal", "--database-id", sourceId, "--recovery-database-id", recoveryId, "--migration-from", migration, "--migration-to", migration, "--output", files.output];
      const recoveryComparison = { ...comparison, comparisonKind: "recovery", target: { environment: "rehearsal", binding: "DB", databaseName: "recovery-rehearsal", databaseId: recoveryId }, sourceTarget: comparison.target, ledger: { ...comparison.ledger, before: state.ledger, appliedThrough: state.ledger.at(-1) }, preDomainDigest: state.domainSha256, postDomainDigest: state.domainSha256 };
      const recoveryComparisonPath = path.join(directory, "recovery-comparison.json");
      writeFileSync(recoveryComparisonPath, JSON.stringify(recoveryComparison));
      const creationPaths = ["source", "recovery"].map((kind) => {
        const file = path.join(directory, `${kind}-creation.json`);
        writeFileSync(file, JSON.stringify({ verdict: "pass", commit, runId: "123", target: kind === "source" ? comparison.target : recoveryComparison.target }));
        return file;
      });
      const recoveryArgs = ["scripts/data/finalize-recovery-rehearsal.mjs", "--comparison", recoveryComparisonPath, "--teardown", files.teardown, "--raw", path.join(directory, "absent-raw.sql"), "--source-database-name", "source-rehearsal", "--source-database-id", sourceId, "--recovery-database-name", "recovery-rehearsal", "--recovery-database-id", recoveryId, "--source-creation", creationPaths[0], "--recovery-creation", creationPaths[1], "--commit", commit, "--environment", "rehearsal", "--migration-from", input, "--migration-to", input, "--sanitizer-manifest", files.manifest, "--output", files.recovery];
      execFileSync(process.execPath, recoveryArgs, { cwd: repoRoot });
      const validRecovery = readFileSync(files.recovery, "utf8");
      for (const badRange of [{ from: null, to: "0024_safe_template_evolution.sql" }, { from: "0023_add_sitemap_revision_state.sql", to: "0023_add_sitemap_revision_state.sql" }]) {
        writeFileSync(recoveryComparisonPath, JSON.stringify({ ...recoveryComparison, migrationRange: badRange }));
        expect(spawnSync(process.execPath, recoveryArgs, { cwd: repoRoot }).status).toBe(1);
      }
      writeFileSync(recoveryComparisonPath, JSON.stringify({ ...recoveryComparison, ledger: { ...recoveryComparison.ledger, after: [...state.ledger].reverse() } }));
      expect(spawnSync(process.execPath, recoveryArgs, { cwd: repoRoot }).status).toBe(1);
      writeFileSync(recoveryComparisonPath, JSON.stringify(recoveryComparison));
      writeFileSync(files.recovery, validRecovery);
      for (let index = 0; index < args.length; index++) if (args[index] == null) args[index] = "none";
      execFileSync(process.execPath, args, { cwd: repoRoot });
      expect(JSON.parse(readFileSync(files.output, "utf8"))).toMatchObject({ commit, target: { environment: "rehearsal", databaseId: sourceId }, migrationRange: { from: migration, to: migration }, coverage: { planId: plan.id, declarationSha256: plan.declarationSha256, artifactSha256: plan.artifactSha256 }, authenticatedRehearsal: { verdict: "pass", sanitizerArtifactSha256: artifact.manifest.artifact.sha256, checks: { templateRead: true, runWriteReadback: true, falseEmptyDetection: "pass", apiErrorDetection: "pass" } }, sanitizedSource: { sanitizerVersion: "source-derived-shape-v2", accessOwner: "@devinschumacher" }, recovery: { recoveryDatabase: { id: recoveryId } } });
      for (const text of [readFileSync(files.output.replace(".json", ".md"), "utf8"), readFileSync(files.output.replace(".json", ".junit.xml"), "utf8")]) for (const value of [commit, sourceId, recoveryId, migration ?? "null", "source-derived-shape-v2"]) expect(text).toContain(value);

      for (const field of ["sourceSha256", "domainSha256", "ledgerSha256"]) {
        const mismatched = structuredClone(comparison); mismatched.sanitizedState[field] = "f".repeat(64);
        writeFileSync(files.comparison, JSON.stringify(mismatched));
        expect(spawnSync(process.execPath, args, { cwd: repoRoot, encoding: "utf8" }).status).toBe(1);
      }
      writeFileSync(files.comparison, JSON.stringify(comparison));

      for (const badRange of [{ from: null, to: "0024_safe_template_evolution.sql" }, { from: "0023_add_sitemap_revision_state.sql", to: "0023_add_sitemap_revision_state.sql" }]) {
        writeFileSync(files.comparison, JSON.stringify({ ...comparison, migrationRange: badRange }));
        expect(spawnSync(process.execPath, args, { cwd: repoRoot }).status).toBe(1);
      }
      writeFileSync(files.comparison, JSON.stringify(comparison));

      const failed = spawnSync(process.execPath, args.map((value) => value === commit ? "f".repeat(40) : value), { cwd: repoRoot, encoding: "utf8" });
      expect(failed.status).toBe(1);
      for (const extension of ["json", "md", "junit.xml"]) expect(readFileSync(path.join(directory, `rehearsal-promotion.${extension}`), "utf8")).toContain("f".repeat(40));
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
