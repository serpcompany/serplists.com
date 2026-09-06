import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateSanitizedRehearsalArtifact } from "./sanitizer-lib.mjs";
import { prepareRecoveryExport } from "./recovery-restore-lib.mjs";

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
      const artifact = generateSanitizedRehearsalArtifact({ migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" }, sourceSchema: "0023_add_sitemap_revision_state.sql", repoRoot, rawExport: readFileSync(path.join(repoRoot, "scripts/data/fixtures/production-export-edge-cases.sql"), "utf8"), sourceDatabaseId: "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1", sourceDate: now.toISOString().slice(0, 10), gitCommit: commit, issueNumber: 95, requestedApproverIdentity: "@devinschumacher", generatedAt: now, retentionDeadline: new Date(now.getTime() + 3600000).toISOString() });
      const manifest = artifact.manifest;
      const files = Object.fromEntries(["comparison", "manifest", "sourceCreation", "recoveryCreation", "teardown", "raw", "output"].map((name) => [name, path.join(directory, name)]));
      const domainDigest = "a".repeat(64); const ledgerDigest = "b".repeat(64);
      const ledger = readdirSync(path.join(repoRoot, "db/migrations")).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
      writeFileSync(files.comparison, JSON.stringify({ check: "remote-invariant-comparison", verdict: "pass", comparisonKind: "recovery", commit, target: { environment: "rehearsal", binding: "DB", databaseName: "recovery-db", databaseId: recoveryId }, sourceTarget: { environment: "rehearsal", binding: "DB", databaseName: "source-db", databaseId: sourceId }, migrationRange: { from: migration, to: migration }, ledger: { before: ledger, after: ledger, verdict: "pass", appliedThrough: migration, afterSha256: ledgerDigest }, preDomainDigest: domainDigest, postDomainDigest: domainDigest }));
      const sanitized = path.join(directory, "sanitized.sql"); writeFileSync(sanitized, artifact.sql);
      const fullRecovery = { version: 1, catalogSha256: "c".repeat(64), dataSha256: "d".repeat(64), tableCount: 1, foreignKeyViolations: 0, integrityCheck: 'quick_check', integrity: "ok" };
      const comparison = JSON.parse(readFileSync(files.comparison, "utf8"));
      comparison.fullRecovery = { verdict: "pass", before: fullRecovery, after: fullRecovery };
      writeFileSync(files.comparison, JSON.stringify(comparison));
      const importEvidencePath = path.join(directory, "import.json");
      writeFileSync(importEvidencePath, JSON.stringify({ verdict: "pass", commit, target: comparison.target, preparedPlaintextCleanup: "pass", transformation: prepareRecoveryExport('PRAGMA defer_foreign_keys=TRUE; CREATE TABLE users(id TEXT);').metadata }));
      writeFileSync(files.manifest, JSON.stringify(manifest));
      writeFileSync(files.sourceCreation, JSON.stringify({ verdict: "pass", commit, runId: "123", target: { databaseName: "source-db", databaseId: sourceId } }));
      writeFileSync(files.recoveryCreation, JSON.stringify({ verdict: "pass", commit, runId: "123", target: { databaseName: "recovery-db", databaseId: recoveryId } }));
      writeFileSync(files.teardown, "PASS rehearsal source-db is absent.\nPASS rehearsal recovery-db is absent.\n");
      const args = ["scripts/data/finalize-recovery-rehearsal.mjs", "--comparison", files.comparison, "--sanitized", sanitized, "--sanitizer-manifest", files.manifest, "--source-creation", files.sourceCreation, "--recovery-creation", files.recoveryCreation, "--teardown", files.teardown, "--raw", files.raw, "--source-database-name", "source-db", "--source-database-id", sourceId, "--recovery-database-name", "recovery-db", "--recovery-database-id", recoveryId, "--commit", commit, "--environment", "rehearsal", "--migration-from", migration, "--migration-to", migration, "--output", files.output];
      args.push("--import-evidence", importEvidencePath);
      const sentinel = 'PRIVATE/customer@example.test/token-secret';
      const retained = () => [files.output, ...['json', 'md', 'txt', 'junit.xml'].map(ext => path.join(directory, `recovery-rehearsal.${ext}`))].filter(file => existsSync(file) && !file.endsWith('.blocked'));
      const runFailure = (candidate) => {
        const result = spawnSync(process.execPath, candidate, { cwd: repoRoot, encoding: 'utf8' });
        expect(result.status).toBe(1);
        expect(result.stdout + result.stderr).not.toContain(sentinel);
        expect(result.stderr).not.toContain(' at file:');
        for (const file of retained()) {
          const text = readFileSync(file, 'utf8');
          expect(text).not.toContain(sentinel);
          expect(text).not.toContain('"verdict": "pass"');
          if (file.endsWith('.xml')) expect(text).toContain('failures="1"');
        }
        if (existsSync(files.output)) expect(JSON.parse(readFileSync(files.output, 'utf8'))).toMatchObject({ verdict: 'fail', errorCode: 'CANARY_STAGE_FAILED' });
      };
      const changedArg = (flag, value) => args.map((item, index) => args[index - 1] === flag ? value : item);
      for (const flag of ['--comparison', '--import-evidence', '--teardown', '--sanitizer-manifest', '--sanitized', '--source-creation', '--recovery-creation']) runFailure(changedArg(flag, path.join(directory, sentinel)));
      for (const flag of ['--commit', '--environment', '--source-database-name', '--source-database-id', '--recovery-database-name', '--recovery-database-id', '--migration-from', '--migration-to']) runFailure(changedArg(flag, sentinel));
      runFailure(changedArg('--migration-to', '9999_private_customer.sql'));
      expect(readFileSync(files.output, 'utf8')).not.toContain('9999_private_customer.sql');
      writeFileSync(files.comparison, `{ "private": "${sentinel}",`);
      runFailure(args);
      writeFileSync(files.comparison, JSON.stringify({ ...comparison, verdict: sentinel }));
      runFailure(args);
      writeFileSync(files.comparison, JSON.stringify(comparison));
      for (const flag of ['--import-evidence', '--sanitizer-manifest', '--source-creation', '--recovery-creation']) {
        const file = args[args.indexOf(flag) + 1];
        const original = readFileSync(file);
        writeFileSync(file, `{ "private": "${sentinel}",`);
        runFailure(args);
        writeFileSync(file, original);
      }
      execFileSync(process.execPath, args, { cwd: repoRoot });
      expect(JSON.parse(readFileSync(files.output, "utf8"))).toMatchObject({ verdict: "pass", commit, sourceDatabase: { id: sourceId }, recoveryDatabase: { id: recoveryId }, migration: { ledgerSha256: ledgerDigest }, creation: { verdict: "pass" }, invariants: { domainDigest } });
      for (const file of retained()) {
        const text = readFileSync(file, 'utf8');
        expect(text).toContain(commit);
        if (file.endsWith('.xml')) expect(text).toContain('failures="0"');
      }
      const privateDirectory = path.join(directory, sentinel);
      mkdirSync(privateDirectory, { recursive: true });
      const privateArgs = [...args];
      for (const flag of ['--comparison', '--teardown']) {
        const index = privateArgs.indexOf(flag) + 1;
        const destination = path.join(privateDirectory, path.basename(privateArgs[index]));
        writeFileSync(destination, readFileSync(privateArgs[index]));
        privateArgs[index] = destination;
      }
      const healthy = spawnSync(process.execPath, privateArgs, { cwd: repoRoot, encoding: 'utf8' });
      expect(healthy.status).toBe(0);
      expect(healthy.stdout + healthy.stderr).not.toContain(sentinel);
      for (const file of retained()) expect(readFileSync(file, 'utf8')).not.toContain(sentinel);
      // A failed rerun must replace the custom success evidence as well.
      runFailure(changedArg('--comparison', path.join(directory, sentinel)));
      execFileSync(process.execPath, args, { cwd: repoRoot });
      const blocked = path.join(directory, 'recovery-rehearsal.junit.xml');
      rmSync(blocked); mkdirSync(blocked);
      const failedPublication = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8' });
      expect(failedPublication.status).toBe(1);
      expect(failedPublication.stderr).not.toContain(directory);
      expect(failedPublication.stderr).not.toContain(' at file:');
      expect(existsSync(files.output)).toBe(false);
      for (const ext of ['json', 'md', 'txt']) expect(existsSync(path.join(directory, `recovery-rehearsal.${ext}`))).toBe(false);
      rmSync(blocked, { recursive: true });
      const privateOutput = path.join(directory, sentinel, 'report.json');
      mkdirSync(path.dirname(privateOutput), { recursive: true });
      mkdirSync(privateOutput);
      runFailure(changedArg('--output', privateOutput));
      for (const altered of [
        { ...comparison, commit: 'f'.repeat(40) },
        { ...comparison, target: { ...comparison.target, databaseId: sourceId } },
        { ...comparison, migrationRange: { from: null, to: null } },
        { ...comparison, ledger: { ...comparison.ledger, after: ledger.slice(1) } },
        { ...comparison, postDomainDigest: 'e'.repeat(64) },
      ]) {
        writeFileSync(files.comparison, JSON.stringify(altered));
        runFailure(args);
      }
      writeFileSync(files.comparison, JSON.stringify(comparison));
      const originalManifest = readFileSync(files.manifest);
      writeFileSync(files.manifest, JSON.stringify({ ...manifest, artifact: { ...manifest.artifact, sha256: 'f'.repeat(64) } }));
      runFailure(args);
      writeFileSync(files.manifest, originalManifest);
      const originalCreation = readFileSync(files.sourceCreation);
      writeFileSync(files.sourceCreation, JSON.stringify({ verdict: 'pass', commit, runId: 'different' }));
      runFailure(args);
      writeFileSync(files.sourceCreation, originalCreation);
      const originalTeardown = readFileSync(files.teardown);
      writeFileSync(files.teardown, sentinel);
      runFailure(args);
      writeFileSync(files.teardown, originalTeardown);
      writeFileSync(files.raw, sentinel);
      runFailure(args);
      rmSync(files.raw);
      for (const fields of ['"foreignKeyViolations":1e-400', '"foreignKeyViolations":1,"foreignKeyViolations":0']) {
        const original = JSON.stringify(comparison);
        const altered = original.replace('"foreignKeyViolations":0', fields);
        expect(JSON.parse(altered)).toEqual(comparison);
        writeFileSync(files.comparison, altered);
        expect(spawnSync(process.execPath, args, {cwd:repoRoot}).status).toBe(1);
      }
      writeFileSync(files.comparison, JSON.stringify({ ...comparison, fullRecovery: { ...comparison.fullRecovery, after: { ...fullRecovery, dataSha256: "e".repeat(64) } } }));
      expect(spawnSync(process.execPath, args, { cwd: repoRoot }).status).toBe(1);
      writeFileSync(files.comparison, JSON.stringify(comparison));
      writeFileSync(importEvidencePath, JSON.stringify({ verdict: "pass" }));
      expect(spawnSync(process.execPath, args, { cwd: repoRoot }).status).toBe(1);
      writeFileSync(files.comparison, JSON.stringify({ verdict: "pass" }));
      expect(spawnSync(process.execPath, args, { cwd: repoRoot }).status).toBe(1);
      for (const name of ["recovery-rehearsal.json", "recovery-rehearsal.md", "recovery-rehearsal.junit.xml"]) expect(readFileSync(path.join(directory, name), "utf8")).toContain(commit);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
