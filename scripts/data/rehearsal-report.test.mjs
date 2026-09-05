import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateSanitizedRehearsalArtifact } from "./sanitizer-lib.mjs";
import { resolveRehearsalPlan } from "./rehearsal-plan-lib.mjs";
import { syntheticSourceDatabase, exportSyntheticRows } from "./sanitizer-test-source.mjs";
import { replayMigrations } from "./schema-contract.ts";
import { sanitizedState } from "./sanitized-state-lib.mjs";
import { DatabaseSync } from 'node:sqlite';
import { captureFullRecoveryState, prepareRecoveryExport } from './recovery-restore-lib.mjs';

const repoRoot = new URL("../..", import.meta.url).pathname;
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
const sourceId = "11111111-1111-4111-8111-111111111111";
const recoveryId = "22222222-2222-4222-8222-222222222222";
const migration = "0024_safe_template_evolution.sql";

// Envelope fixtures use a real prepared export and complete logical state;
// the separate local-D1 integration test proves the actual Wrangler transport.
function exportFixtureDatabase(database) {
  const identifier = name => '"' + name.replaceAll('"', '""') + '"';
  const tables = database.prepare("SELECT name,sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
  const statements = ['PRAGMA defer_foreign_keys=TRUE;'];
  for (const table of tables) {
    statements.push(`${table.sql};`);
    const columns = database.prepare(`PRAGMA table_info(${identifier(table.name)})`).all().map(column => identifier(column.name));
    const rows = database.prepare(`SELECT ${columns.map((name, index) => `quote(${name}) AS c${index}`).join(',')} FROM ${identifier(table.name)}`).all();
    for (const row of rows) statements.push(`INSERT INTO ${identifier(table.name)} VALUES (${Object.values(row).join(',')});`);
  }
  statements.push(...database.prepare("SELECT sql FROM sqlite_schema WHERE type IN ('index','trigger','view') AND sql IS NOT NULL ORDER BY type,name").all().map(row => `${row.sql};`));
  return statements.join('\n');
}

// Evidence-envelope unit tests. These are not proof that authenticated handlers
// or remote recovery ran; those gates require actual runtime reports.
describe("rehearsal report finalization", () => {
  it.each([migration, "none"])("binds the full recovery/rehearsal report chain for %s", (input) => {
    const migration = input === "none" ? null : input;
    const plan = resolveRehearsalPlan({ repoRoot, commit, migrationFrom: input, migrationTo: input });
    const directory = mkdtempSync(path.join(tmpdir(), "rehearsal-report-"));
    try {
      const now = new Date();
      const sourceDatabase = syntheticSourceDatabase(repoRoot, input === "none");
      const rawExport = exportSyntheticRows(sourceDatabase); sourceDatabase.close();
      const artifact = generateSanitizedRehearsalArtifact({ migrationRange: plan.migrationRange, sourceSchema: plan.preMigration,
        repoRoot,
        rawExport,
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
      const database = replayMigrations({ through: plan.preMigration });
      database.exec(artifact.sql);
      if (migration) database.exec(readFileSync(path.join(repoRoot, "db/migrations", migration), "utf8"));
      const { rows: _rows, ...state } = sanitizedState({ templates: database.prepare("SELECT * FROM templates").all(), runs: database.prepare("SELECT * FROM checklist_runs").all(), ledger: readdirSync(path.join(repoRoot, "db/migrations")).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort(), sourceSha256: artifact.manifest.artifact.sha256 });
      database.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL)');
      state.ledger.forEach((name, index) => database.prepare('INSERT INTO d1_migrations VALUES(?,?)').run(index + 1, name));
      const completeState = db => captureFullRecoveryState({ key: 'fixture-full-recovery-equality-key-0000', query: sql => JSON.stringify([{ results: db.prepare(sql).all() }]) });
      const fullBefore = completeState(database);
      const prepared = prepareRecoveryExport(exportFixtureDatabase(database));
      const restored = new DatabaseSync(':memory:');
      let fullAfter;
      try { restored.exec(`PRAGMA foreign_keys=ON; BEGIN; ${prepared.sql} COMMIT;`); fullAfter = completeState(restored); }
      finally { restored.close(); }
      expect(fullAfter).toEqual(fullBefore);
      database.close();
      const source = JSON.parse(readFileSync(files.source, "utf8"));
      Object.assign(source.authenticatedRehearsal, { postMigrationState: state, transformation: { verdict: "pass" }, sourceProfile: artifact.manifest.sourceProfile, manifestIntegritySha256: artifact.manifest.manifestIntegritySha256, handlerStateReadback: true });
      writeFileSync(files.source, JSON.stringify(source));
      const comparison = JSON.parse(readFileSync(files.comparison, "utf8"));
      Object.assign(comparison, { sanitizedState: state, ledger: { verdict: "pass", before: migration ? state.ledger.slice(0, -1) : state.ledger, after: state.ledger, afterSha256: state.ledgerSha256 } });
      writeFileSync(files.comparison, JSON.stringify(comparison));
      const args = ["scripts/data/finalize-rehearsal-report.mjs", "--source", files.source, "--comparison", files.comparison, "--recovery", files.recovery, "--teardown", files.teardown, "--sanitized", files.sanitized, "--sanitizer-manifest", files.manifest, "--commit", commit, "--database-name", "source-rehearsal", "--database-id", sourceId, "--recovery-database-id", recoveryId, "--migration-from", migration, "--migration-to", migration, "--output", files.output];
      const recoveryComparison = { ...comparison, comparisonKind: "recovery", target: { environment: "rehearsal", binding: "DB", databaseName: "recovery-rehearsal", databaseId: recoveryId }, sourceTarget: comparison.target, ledger: { ...comparison.ledger, before: state.ledger, appliedThrough: state.ledger.at(-1) }, preDomainDigest: state.domainSha256, postDomainDigest: state.domainSha256, fullRecovery: { verdict: 'pass', before: fullBefore, after: fullAfter } };
      const importEvidencePath = path.join(directory, 'recovery-import.json');
      writeFileSync(importEvidencePath, JSON.stringify({ verdict: 'pass', commit, target: recoveryComparison.target, preparedPlaintextCleanup: 'pass', transformation: prepared.metadata }));
      const recoveryComparisonPath = path.join(directory, "recovery-comparison.json");
      writeFileSync(recoveryComparisonPath, JSON.stringify(recoveryComparison));
      const creationPaths = ["source", "recovery"].map((kind) => {
        const file = path.join(directory, `${kind}-creation.json`);
        writeFileSync(file, JSON.stringify({ verdict: "pass", commit, runId: "123", target: kind === "source" ? comparison.target : recoveryComparison.target }));
        return file;
      });
      const recoveryArgs = ["scripts/data/finalize-recovery-rehearsal.mjs", "--comparison", recoveryComparisonPath, "--teardown", files.teardown, "--raw", path.join(directory, "absent-raw.sql"), "--source-database-name", "source-rehearsal", "--source-database-id", sourceId, "--recovery-database-name", "recovery-rehearsal", "--recovery-database-id", recoveryId, "--source-creation", creationPaths[0], "--recovery-creation", creationPaths[1], "--commit", commit, "--environment", "rehearsal", "--migration-from", input, "--migration-to", input, "--sanitized", files.sanitized, "--sanitizer-manifest", files.manifest, "--output", files.recovery];
      recoveryArgs.push('--import-evidence', importEvidencePath);
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
      expect(JSON.parse(readFileSync(files.output, "utf8"))).toMatchObject({ commit, target: { environment: "rehearsal", databaseId: sourceId }, migrationRange: { from: migration, to: migration }, coverage: { planId: plan.id, declarationSha256: plan.declarationSha256, artifactSha256: plan.artifactSha256 }, authenticatedRehearsal: { verdict: "pass", sanitizerArtifactSha256: artifact.manifest.artifact.sha256, checks: { templateRead: true, runWriteReadback: true, falseEmptyDetection: "pass", apiErrorDetection: "pass" } }, sanitizedSource: { sanitizerVersion: "source-derived-shape-v4", accessOwner: "@devinschumacher" }, recovery: { recoveryDatabase: { id: recoveryId } } });
      for (const text of [readFileSync(files.output.replace(".json", ".md"), "utf8"), readFileSync(files.output.replace(".json", ".junit.xml"), "utf8")]) for (const value of [commit, sourceId, recoveryId, migration ?? "null", "source-derived-shape-v4"]) expect(text).toContain(value);

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
