import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync, statSync, chmodSync } from "node:fs";
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
import { validatePromotionEvidence, validateGitHubRunEvidence } from './production-executor-lib.mjs';
import { publicEvidence } from './publication-evidence-lib.mjs';

const repoRoot = new URL("../..", import.meta.url).pathname;
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
const sourceId = "11111111-1111-4111-8111-111111111111";
const recoveryId = "22222222-2222-4222-8222-222222222222";
const migration = "0024_safe_template_evolution.sql";

// Envelope fixtures use a real prepared export and complete logical state;
// the separate local-D1 integration test proves the actual Wrangler transport.
function exportFixtureDatabase(database) {
  const identifier = name => '"' + name.replaceAll('"', '""') + '"';
  const tables = database.prepare("SELECT name,sql FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY rowid").all();
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
      // Explicit envelope-only source additions provide eligible canaries while
      // retaining the original malformed rows for refusal coverage.
      const owner = sourceDatabase.prepare('SELECT id FROM users LIMIT 1').get().id;
      sourceDatabase.prepare("INSERT INTO templates(id,user_id,title,items,is_public,slug,version,created_at) VALUES ('envelope-template',?,'Envelope template','[]',0,'envelope-template',1,'2026-09-05')").run(owner);
      sourceDatabase.prepare("INSERT INTO checklist_runs(id,user_id,title,items,is_public,status,progress,template_id,created_at,started_at) VALUES ('envelope-run',?,'Envelope run','[]',0,'in_progress',0,'envelope-template','2026-09-05','2026-09-05')").run(owner);
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
      const { rows: _rows, ...state } = sanitizedState({ templates: database.prepare("SELECT * FROM templates").all(), runs: database.prepare("SELECT * FROM checklist_runs").all(), principals: database.prepare('SELECT id FROM users').all(), teams: database.prepare('SELECT * FROM teams').all(), members: database.prepare('SELECT * FROM team_members').all(), ledger: readdirSync(path.join(repoRoot, "db/migrations")).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort(), sourceSha256: artifact.manifest.artifact.sha256 });
      database.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL)');
      state.ledger.forEach((name, index) => database.prepare('INSERT INTO d1_migrations VALUES(?,?)').run(index + 1, name));
      const completeState = db => captureFullRecoveryState({ key: 'fixture-full-recovery-equality-key-0000', query: sql => JSON.stringify([{ success: true, meta: { duration: 0 }, results: db.prepare(sql).all() }]) });
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
      source.authenticatedRehearsal.cohortProof = { cohortSha256: state.cohortSha256, selectedCounts: artifact.manifest.selection.selectedCounts, profileExclusions: artifact.manifest.selection.profileExclusions, authenticatedPrincipals: [], withheldRows: [], contexts: [{ kind: 'templates', write: 'pass' }, { kind: 'runs', write: 'pass' }], measurements: { rowReads: 4, privateDenials: 0, roleWriteDenials: 0, templateWrites: 1, runWrites: 1 } };
      // Fixture metadata models the real selected principal, independent of the
      // mocked successful browser outcomes used to test this report boundary.
      source.authenticatedRehearsal.cohortProof.authenticatedPrincipals = ['rehearsal-owner-1'];
      source.authenticatedRehearsal.cohortProof.postHandlerPreservation = { verdict: 'pass', cohortSha256: state.cohortSha256, withheldRows: 0, malformedRows: 0, untouchedRows: 2, writtenRows: 2 };
      const cohortProof = source.authenticatedRehearsal.cohortProof;
      cohortProof.requirementsSha256 = state.requirementsSha256;
      cohortProof.cases = state.requirements.cases.map(row => ({ ...row, verdict: 'pass' }));
      cohortProof.contexts = state.requirements.contexts.map(row => ({ kind: row.kind, contextId: row.contextId, principal: row.principals[0], id: row.candidateIds[0], write: 'pass', browserWriteReadback: 'pass' }));
      for (const [key, action] of [['rowReads','read'], ['privateDenials','private-denial'], ['roleWriteDenials','role-write-denial']]) cohortProof.measurements[key] = state.requirements.cases.filter(row => row.action === action).length;
      cohortProof.postHandlerPreservation.untouchedRows = artifact.manifest.selection.selectedCounts.templates + artifact.manifest.selection.selectedCounts.checklistRuns - 2;
      cohortProof.postHandlerPreservation.malformedRows = state.requirements.cases.filter(row => row.action === 'malformed-refusal').length;
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
      expect(JSON.parse(readFileSync(files.output, 'utf8')).sanitizedSource.selection).toEqual(artifact.manifest.selection);
      // Consume the actual finalizer output, including its row-free independent
      // state, rather than constructing a guessed rehearsal envelope.
      const rehearsal = JSON.parse(readFileSync(files.output, 'utf8'));
      const tree = 'd'.repeat(40), stagingCommit = 'c'.repeat(40);
      const runEvidence = (head_sha, name, head_branch, workflow) => ({ id: 101, head_sha, conclusion: 'success', name, event: 'push', head_branch, path: `.github/workflows/${workflow}`, repository: { full_name: 'serpcompany/serplists.com' } });
      const promotionEvidence = {
        commit, classification: migration ? 'backfill' : 'additive', database: { databaseName: 'serp-checklists-db', databaseId: 'b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1' },
        pendingMigrations: migration ? [migration] : [], migrationRange: plan.migrationRange, rehearsal,
        ci: { ...source, workingTreeDirty: false },
        ciContractCorrection: { verdict: 'pass', commit, eventName: 'push', comparisonBase: commit },
        ciSchemaContract: { verdict: 'pass', commit, runtimeDiff: { verdict: 'pass' }, authorityDiff: { verdict: 'pass' }, snapshotDiff: { verdict: 'pass' }, migrationRange: { from: state.ledger[0], to: state.ledger.at(-1) } },
        ciRun: runEvidence(commit, 'CI', 'main', 'ci.yml'),
        stagingRun: runEvidence(stagingCommit, 'Protected data promotion and Pages deploy', 'staging', 'cloudflare-pages-deploy.yml'),
        mergeContext: { commit, tree, baseCommit: commit },
        changeProvenance: { mergeCommit: commit, pullRequestHeadCommit: stagingCommit, changeAuthors: ['author'] },
        staging: { verdict: 'pass', commit: stagingCommit, tree, migrationRange: plan.migrationRange,
          target: { environment: 'staging', databaseId: 'fcaf4325-5be7-4ead-ab60-45932a04177b' },
          data: { verdict: 'pass' }, schema: { verdict: 'pass', ledger: { verdict: 'pass' } }, invariants: { verdict: 'pass' }, deploy: { verdict: 'pass' }, teardown: { verdict: 'pass' },
          smoke: { verdict: 'pass', failures: [], controlledCanaryMutationApproved: true, canaryEvidenceDigest: 'a'.repeat(64), checks: ['template_canary_designated', 'template_write', 'template_write_readback', 'template_restore', 'run_canary_designated', 'run_write', 'run_write_readback', 'run_restore'].map(name => ({ name, verdict: 'pass' })) },
        },
      };
      expect(validatePromotionEvidence(promotionEvidence).rehearsal).toEqual(rehearsal);
      expect(JSON.parse(readFileSync(files.output, "utf8"))).toMatchObject({ commit, target: { environment: "rehearsal", databaseId: sourceId }, migrationRange: { from: migration, to: migration }, coverage: { planId: plan.id, declarationSha256: plan.declarationSha256, artifactSha256: plan.artifactSha256 }, authenticatedRehearsal: { verdict: "pass", sanitizerArtifactSha256: artifact.manifest.artifact.sha256, checks: { templateRead: true, runWriteReadback: true, falseEmptyDetection: "pass", apiErrorDetection: "pass" } }, sanitizedSource: { sanitizerVersion: "source-derived-shape-v5", accessOwner: "@devinschumacher" }, recovery: { recoveryDatabase: { id: recoveryId } } });
      for (const text of [readFileSync(files.output.replace(".json", ".md"), "utf8"), readFileSync(files.output.replace(".json", ".junit.xml"), "utf8")]) for (const value of [commit, sourceId, recoveryId, migration ?? "null", "source-derived-shape-v5"]) expect(text).toContain(value);

      // Mutate raw bytes at the artifact boundary, before the real entrypoint
      // can discard duplicate keys or round numeric evidence.
      const sentinel = path.join(directory, 'rehearsal-promotion.json');
      writeFileSync(sentinel, 'UNRELATED_SENTINEL');
      for (const name of ['comparison', 'source', 'manifest', 'recovery']) {
        const original = readFileSync(files[name], 'utf8');
        try {
          for (const [raw, passes] of [
            ['"foreignKeyViolations":0.0e99,"count":1.00e2', true],
            ['"foreignKeyViolations":1e-9999', false],
            ['"foreignKeyViolations":1e9999', false],
            ['"foreignKeyViolations":9007199254740993', false],
            ['"foreignKeyViolations":-0', false],
            ['"foreignKeyViolations":1,"foreignKey\\u0056iolations":0', false],
            ['"private":"PRIVATE_RAW_EVIDENCE",', false],
            ['"sanitizerVersion":"source-derived-shape-v5","sanitizer\\u0056ersion":"PRIVATE_RAW_EVIDENCE"', false],
          ]) {
            writeFileSync(files[name], original);
            execFileSync(process.execPath, args, { cwd: repoRoot, stdio: 'pipe' });
            expect(validatePromotionEvidence({ ...promotionEvidence, rehearsal: JSON.parse(readFileSync(files.output)) }).rehearsal.verdict).toBe('pass');
            // The signed manifest must retain its mathematical contents.
            writeFileSync(files[name], passes && name === 'manifest'
              ? original.replace('"schemaVersion":4', '"schemaVersion":4.00e0')
              : original.trimEnd().replace(/}$/, `,${raw}}`));
            const result = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8' });
            expect(result.status, `${name}: ${raw}`).toBe(passes ? 0 : 1);
            const reportPath = files.output;
            expect(JSON.parse(readFileSync(reportPath))).toMatchObject({ verdict: passes ? 'pass' : 'fail', commit, target: { environment: 'rehearsal', databaseName: passes ? 'source-rehearsal' : 'unknown', databaseId: passes ? sourceId : 'unknown' }, migrationRange: { from: migration, to: migration } });
            if (!passes) expect(() => validatePromotionEvidence({ ...promotionEvidence, rehearsal: JSON.parse(readFileSync(files.output)) })).toThrow();
            expect(readFileSync(sentinel, 'utf8')).toBe('UNRELATED_SENTINEL');
            for (const suffix of passes ? ['json', 'md', 'junit.xml'] : ['json', 'md', 'txt', 'junit.xml']) {
              const text = readFileSync(reportPath.replace(/\.json$/, `.${suffix}`), 'utf8');
              expect(text).not.toContain('PRIVATE_RAW_EVIDENCE');
              for (const value of [commit, 'rehearsal', ...(passes ? [sourceId] : [])]) expect(text).toContain(value);
            }
            expect(result.stdout + result.stderr).not.toContain('PRIVATE_RAW_EVIDENCE');
          }
        } finally { writeFileSync(files[name], original); }
      }

      const originalSource = readFileSync(files.source, 'utf8');
      const originalManifest = readFileSync(files.manifest, 'utf8');
      const runWithFault = (fault, command = args) => spawnSync(process.execPath, ['--input-type=module', '--eval', `
        import fs from 'node:fs';
        import { syncBuiltinESMExports } from 'node:module';
        import { pathToFileURL } from 'node:url';
        const output = ${JSON.stringify(files.output)};
        const fault = ${JSON.stringify(fault)};
        for (const method of ['writeFileSync', 'renameSync', 'unlinkSync', 'mkdirSync', 'mkdtempSync', 'rmSync', 'chmodSync']) {
          const original = fs[method];
          fs[method] = (...values) => {
            const destination = String(method === 'renameSync' ? values[1] : values[0]);
            if (method === 'renameSync' && destination !== output && fs.existsSync(output) && JSON.parse(fs.readFileSync(output)).verdict === 'pass') process.stdout.write('EARLY_PASS');
            if (fault === 'no-writes') process.stderr.write('UNEXPECTED_MUTATION');
            if (fault === 'all' || fault === 'no-writes' ||
                (fault === 'direct' && method === 'writeFileSync' && destination === output) ||
                (fault === 'companion' && (method === 'writeFileSync' || method === 'renameSync') && destination.endsWith('.md')) ||
                (fault === 'companion-rename' && method === 'renameSync' && destination.endsWith('.txt')) ||
                (fault === 'publication' && method === 'renameSync' && destination === output)) {
              throw Object.assign(new Error('PRIVATE_IO_PATH'), { code: 'EACCES' });
            }
            return original(...values);
          };
        }
        syncBuiltinESMExports();
        process.argv = [process.execPath, ...${JSON.stringify(command)}];
        await import(pathToFileURL(process.argv[1]));
      `], { cwd: repoRoot, encoding: 'utf8' });

      for (const invalidOutput of ['custom.JSON', 'custom', '.json', 'source']) {
        const changedArgs = [...args];
        changedArgs[changedArgs.indexOf('--output') + 1] = path.join(directory, invalidOutput);
        const result = runWithFault('no-writes', changedArgs);
        expect(result.status).toBe(1);
        expect(result.stderr).not.toContain('PRIVATE_IO_PATH');
        expect(result.stderr).not.toContain('UNEXPECTED_MUTATION');
      }
      for (const extension of ['json', 'md', 'txt', 'junit.xml']) {
        const changedArgs = [...args];
        changedArgs[changedArgs.indexOf('--source') + 1] = files.output.replace(/\.json$/, `.${extension}`);
        const result = runWithFault('no-writes', changedArgs);
        expect(result.status).toBe(1);
        expect(result.stderr).not.toContain('UNEXPECTED_MUTATION');
        expect(result.stderr).not.toContain('PRIVATE_IO_PATH');
      }
      for (const fault of ['direct', 'companion', 'companion-rename', 'publication', 'all']) {
        execFileSync(process.execPath, args, { cwd: repoRoot, stdio: 'pipe' });
        if (fault === 'direct') chmodSync(files.output, 0o400);
        const result = runWithFault(fault);
        expect(result.status, fault).toBe(fault === 'direct' ? 0 : 1);
        expect(result.stderr).not.toContain('PRIVATE_IO_PATH');
        expect(result.stdout).not.toContain('EARLY_PASS');
        if (fault === 'direct') expect(statSync(files.output).mode & 0o777).toBe(0o400);
        if (fault !== 'all' && fault !== 'direct' && existsSync(files.output)) expect(JSON.parse(readFileSync(files.output)).verdict).toBe('fail');
        if (fault === 'all') {
          expect(JSON.parse(readFileSync(files.output)).verdict).toBe('pass');
          // Synthetic failed-attempt metadata tests the real consumer gates;
          // historical report bytes do not supply workflow authority.
          const run = { id: 101, run_attempt: 2, head_sha: commit, status: 'completed', conclusion: 'failure', name: 'Data migration rehearsal', event: 'workflow_dispatch', head_branch: 'main', path: '.github/workflows/data-migration-rehearsal.yml', repository: { full_name: 'serpcompany/serplists.com' }, head_repository: { full_name: 'serpcompany/serplists.com' } };
          expect(() => validateGitHubRunEvidence({ metadata: run, commit, workflowName: run.name, eventName: run.event, headBranch: run.head_branch, workflowPath: run.path })).toThrow();
          expect(publicEvidence({ run, envelope: { commit, runId: 101, attempt: 1, environment: 'rehearsal', databaseId: sourceId, migrationRange: plan.migrationRange }, migrationNames: state.ledger, pullNumbers: [151] })).toMatchObject({ verdict: 'fail', attempt: 2 });
        }
        execFileSync(process.execPath, args, { cwd: repoRoot, stdio: 'pipe' });
        expect(JSON.parse(readFileSync(files.output)).verdict).toBe('pass');
        for (const extension of ['json', 'md', 'txt', 'junit.xml']) expect(statSync(files.output.replace(/\.json$/, `.${extension}`)).mode & 0o077).toBe(0);
        expect(readFileSync(sentinel, 'utf8')).toBe('UNRELATED_SENTINEL');
        expect(readdirSync(directory).filter(name => name.startsWith('.rehearsal-publication-'))).toEqual([]);
      }
      // Reuse the public custom output across recovery from a failed run;
      // never remove a companion report to make the next outcome agree.
      for (const verdict of ['pass', 'fail', 'pass']) {
        writeFileSync(files.source, verdict === 'fail' ? 'PRIVATE_CYCLE_INPUT' : originalSource);
        const result = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8' });
        expect(result.status).toBe(verdict === 'pass' ? 0 : 1);
        const report = JSON.parse(readFileSync(files.output));
        expect(report.verdict).toBe(verdict);
        if (verdict === 'pass') expect(validatePromotionEvidence({ ...promotionEvidence, rehearsal: report }).rehearsal.verdict).toBe('pass');
        else expect(() => validatePromotionEvidence({ ...promotionEvidence, rehearsal: report })).toThrow();
        const junit = readFileSync(files.output.replace(/\.json$/, '.junit.xml'), 'utf8');
        expect(junit).toContain(`failures="${verdict === 'pass' ? 0 : 1}"`);
        for (const extension of ['md', 'txt']) {
          const text = readFileSync(files.output.replace(/\.json$/, `.${extension}`), 'utf8');
          expect(text).toContain(verdict === 'pass' ? 'rehearsal: PASS' : 'Verdict: FAIL');
          if (verdict === 'pass') {
            expect(text).not.toContain('BLOCKED');
            expect(text).toContain('Selected authorization cohort digest:');
            expect(text).toContain('Post-handler source preservation:');
          }
        }
        for (const extension of ['json', 'md', 'txt', 'junit.xml']) {
          const text = readFileSync(files.output.replace(/\.json$/, `.${extension}`), 'utf8');
          expect(text).not.toContain('PRIVATE_CYCLE_INPUT');
          expect(text).toContain(commit);
          expect(text).toContain('rehearsal');
        }
        expect(result.stdout + result.stderr).not.toContain('PRIVATE_CYCLE_INPUT');
        expect(readFileSync(sentinel, 'utf8')).toBe('UNRELATED_SENTINEL');
      }
      for (const scenario of ['unverified-version', 'missing-source', 'missing-sanitized', 'invalid-version', 'teardown']) {
        execFileSync(process.execPath, args, { cwd: repoRoot, stdio: 'pipe' });
        const changedArgs = [...args];
        const originalTeardown = readFileSync(files.teardown, 'utf8');
        try {
          if (scenario === 'unverified-version' || scenario === 'invalid-version') {
            writeFileSync(files.manifest, JSON.stringify({ ...JSON.parse(originalManifest), sanitizerVersion: 'PRIVATE_VERSION@example.com' }));
            if (scenario === 'unverified-version') writeFileSync(files.source, 'PRIVATE_SOURCE');
          } else if (scenario === 'teardown') writeFileSync(files.teardown, 'PRIVATE_TEARDOWN');
          else changedArgs[changedArgs.indexOf(scenario === 'missing-source' ? '--source' : '--sanitized') + 1] = path.join(directory, 'PRIVATE_MISSING_INPUT@example.com');
          const result = spawnSync(process.execPath, changedArgs, { cwd: repoRoot, encoding: 'utf8' });
          expect(result.status).toBe(1);
          const report = JSON.parse(readFileSync(files.output));
          expect(() => validatePromotionEvidence({ ...promotionEvidence, rehearsal: report })).toThrow();
          expect(report).toMatchObject({ verdict: 'fail', commit, target: { environment: 'rehearsal' }, migrationRange: { from: migration, to: migration }, sanitizerVersion: scenario === 'teardown' ? 'source-derived-shape-v5' : 'unknown', errorCode: 'CANARY_STAGE_FAILED', failedStage: scenario === 'teardown' ? 'data-delete' : scenario === 'missing-sanitized' ? 'data-export' : scenario === 'invalid-version' ? 'data-restore' : 'data-reporting' });
          if (scenario === 'teardown') expect(report.target).toMatchObject({ databaseName: 'source-rehearsal', databaseId: sourceId });
          for (const extension of ['json', 'md', 'txt', 'junit.xml']) {
            const text = readFileSync(files.output.replace(/\.json$/, `.${extension}`), 'utf8');
            expect(text).not.toContain('PRIVATE_');
            for (const value of [commit, 'rehearsal', migration ?? (extension === 'junit.xml' ? 'none' : 'null')]) expect(text).toContain(value);
          }
          expect(result.stdout + result.stderr).not.toContain('PRIVATE_');
          expect(readFileSync(sentinel, 'utf8')).toBe('UNRELATED_SENTINEL');
        } finally {
          writeFileSync(files.source, originalSource);
          writeFileSync(files.manifest, originalManifest);
          writeFileSync(files.teardown, originalTeardown);
        }
      }

      for (const field of ["sourceSha256", "domainSha256", "cohortSha256", "ledgerSha256"]) {
        const mismatched = structuredClone(comparison); mismatched.sanitizedState[field] = "f".repeat(64);
        writeFileSync(files.comparison, JSON.stringify(mismatched));
        expect(spawnSync(process.execPath, args, { cwd: repoRoot, encoding: "utf8" }).status).toBe(1);
      }
      writeFileSync(files.comparison, JSON.stringify(comparison));

      for (const mutate of [proof => { delete proof.cohortProof; }, proof => { proof.cohortProof.authenticatedPrincipals = []; }, proof => { proof.cohortProof.measurements.rowReads = 0; }]) {
        const changed = structuredClone(source); mutate(changed.authenticatedRehearsal);
        writeFileSync(files.source, JSON.stringify(changed));
        expect(spawnSync(process.execPath, args, { cwd: repoRoot }).status).toBe(1);
      }
      writeFileSync(files.source, JSON.stringify(source));

      for (const badRange of [{ from: null, to: "0024_safe_template_evolution.sql" }, { from: "0023_add_sitemap_revision_state.sql", to: "0023_add_sitemap_revision_state.sql" }]) {
        writeFileSync(files.comparison, JSON.stringify({ ...comparison, migrationRange: badRange }));
        expect(spawnSync(process.execPath, args, { cwd: repoRoot }).status).toBe(1);
      }
      writeFileSync(files.comparison, JSON.stringify(comparison));

      const failed = spawnSync(process.execPath, args.map((value) => value === commit ? "f".repeat(40) : value), { cwd: repoRoot, encoding: "utf8" });
      expect(failed.status).toBe(1);
      for (const extension of ["json", "md", "junit.xml"]) expect(readFileSync(files.output.replace(/\.json$/, `.${extension}`), "utf8")).toContain("f".repeat(40));
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 30000);
});
