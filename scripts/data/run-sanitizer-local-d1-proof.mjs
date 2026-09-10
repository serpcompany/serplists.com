import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from 'node:crypto';
import path from "node:path";
import assert from "node:assert/strict";
import { generateSanitizedRehearsalArtifact } from "./sanitizer-lib.mjs";
import { prepareSanitizedSmoke } from "./prepare-sanitized-smoke.mjs";
import { captureSanitizedState, validateSanitizedStateBinding } from "./sanitized-state-lib.mjs";
import { captureFullRecoveryState, prepareRecoveryExport, withPreparedRecoveryImport } from "./recovery-restore-lib.mjs";
import { parseAppliedMigrationLedger } from './invariant-capture-lib.mjs';
import { writeDataCheckReports } from './reporting.mjs';

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const migration = "0024_safe_template_evolution.sql";
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
const restorations = [];


// Keep synchronous Wrangler calls out of the Vitest worker event loop.
function runRealLocalD1Proof() {
    const root = path.join(repoRoot, "tmp/rehearsal-sensitive"); mkdirSync(root, { recursive: true });
    const directory = mkdtempSync(path.join(root, "sanitizer-real-d1-"));
    const artifactsRoot = path.join(repoRoot, 'tmp/data-evidence'); mkdirSync(artifactsRoot, { recursive: true });
    const artifactDirectory = mkdtempSync(path.join(artifactsRoot, 'sanitizer-derived-'));
    const run = (args, cwd = directory) => execFileSync(process.execPath, [path.join(repoRoot, "node_modules/wrangler/bin/wrangler.js"), ...args], {
      cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
      env: { PATH: process.env.PATH, CI: "true", WRANGLER_SEND_METRICS: "false", WRANGLER_LOG_PATH: path.join(directory, "wrangler.log") },
    });
    const migrations = path.join(directory, "migrations"); mkdirSync(migrations);
    const config = path.join(directory, "wrangler.toml");
    writeFileSync(config, `name="sanitizer-local-proof"\ncompatibility_date="2026-09-05"\n[[d1_databases]]\nbinding="DB"\ndatabase_name="synthetic-source"\ndatabase_id="11111111-1111-4111-8111-111111111111"\nmigrations_dir=${JSON.stringify(migrations)}\n`);
    const source = (args) => run(["d1", ...args, "--config", config]);
    const sourceExport = path.join(directory, "source.sql");
    try {
      for (const file of readdirSync(path.join(repoRoot, "db/migrations")).filter((file) => /^\d{4}_.+\.sql$/.test(file) && file < migration)) copyFileSync(path.join(repoRoot, "db/migrations", file), path.join(migrations, file));
      source(["migrations", "apply", "synthetic-source", "--local"]);
      source(["execute", "synthetic-source", "--local", "--file", path.join(repoRoot, "scripts/data/fixtures/production-export-edge-cases.sql"), "--yes"]);
      for (const current of [false, true]) {
        if (current) { copyFileSync(path.join(repoRoot, "db/migrations", migration), path.join(migrations, migration)); source(["migrations", "apply", "synthetic-source", "--local"]); }
        const sourceLedger = parseAppliedMigrationLedger(source(['execute', 'synthetic-source', '--local', '--json', '--command', 'SELECT id, name FROM d1_migrations ORDER BY id']));
        const expectedSourceLedger = readdirSync(path.join(repoRoot, 'db/migrations')).filter(name => /^\d{4}_.+\.sql$/.test(name) && (current || name < migration)).sort();
        assert.deepEqual(sourceLedger, expectedSourceLedger, `Actual ${current ? 'post' : 'pre'}-0024 source export boundary`);
        // Restore the original fixture at both sides of 0024 too: the prepared
        // smoke target below is always upgraded to current schema.
        if (!current) {
          const fullSourceExport = path.join(directory, 'source-full-pre0024.sql');
          source(["export", "synthetic-source", "--local", "--output", fullSourceExport]);
          const fullSourceQuery = statement => source(["execute", "synthetic-source", "--local", "--json", "--command", statement]);
          const originalState = captureFullRecoveryState({ query: fullSourceQuery, key: "synthetic-local-recovery-key-issue120" });
          const originalRestoreDir = path.join(directory, 'source-restore-pre0024'); mkdirSync(originalRestoreDir);
          const originalRestoreConfig = path.join(originalRestoreDir, "wrangler.toml");
          writeFileSync(originalRestoreConfig, readFileSync(config, "utf8"));
          withPreparedRecoveryImport({ inputPath: fullSourceExport,
            expectedSourceSha256: prepareRecoveryExport(readFileSync(fullSourceExport)).metadata.sourceSha256,
            execute: file => run(["d1", "execute", "synthetic-source", "--local", "--config", originalRestoreConfig, "--file", file, "--yes"]),
          });
          assert.deepEqual(captureFullRecoveryState({ key: "synthetic-local-recovery-key-issue120", query: statement => run(["d1", "execute", "synthetic-source", "--local", "--config", originalRestoreConfig, "--json", "--command", statement]) }), originalState);
          restorations.push({kind:'original-source', sourceBoundary:'pre0024', migrationLedger:sourceLedger, fullStateEquality:true, exportSha256:createHash('sha256').update(readFileSync(fullSourceExport)).digest('hex')});
        }
        source(["export", "synthetic-source", "--local", "--no-schema", "--output", sourceExport]);
        const now = new Date();
        const artifact = generateSanitizedRehearsalArtifact({ repoRoot, rawExport: readFileSync(sourceExport, "utf8"), migrationRange: { from: current ? null : migration, to: current ? null : migration }, sourceSchema: current ? migration : "0023_add_sitemap_revision_state.sql", sourceDatabaseId: "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1", sourceDate: now.toISOString().slice(0, 10), gitCommit: commit, issueNumber: 117, requestedApproverIdentity: "@devinschumacher", generatedAt: now, retentionDeadline: new Date(now.getTime() + 3600000).toISOString() });
        // The provenance identity above exercises the policy using synthetic
        // bytes. This test never connects to or observes that remote database.
        const sql = path.join(artifactDirectory, `${current}.sql`); const manifest = path.join(artifactDirectory, `${current}.json`);
        writeFileSync(sql, artifact.sql); writeFileSync(manifest, JSON.stringify(artifact.manifest));
        assert.equal(artifact.manifest.selection.coveredShapes.includes("legacy-flat-items"), !current);
        const targetDirectory = path.join(directory, `target-${current}`); mkdirSync(targetDirectory);
        const persistPath = path.join(targetDirectory, ".wrangler/state");
        const env = { PLAYWRIGHT_SANITIZED_REHEARSAL_SQL: sql, PLAYWRIGHT_SANITIZER_MANIFEST: manifest, PLAYWRIGHT_SANITIZER_SHA256: artifact.manifest.artifact.sha256, DATA_REGRESSION_START_COMMIT: commit, DATA_REGRESSION_MIGRATION_FROM: current ? "none" : migration, DATA_REGRESSION_MIGRATION_TO: current ? "none" : migration };
        prepareSanitizedSmoke({ repoRoot, persistPath, env, wrangler: run });
        const state = JSON.parse(readFileSync(env.PLAYWRIGHT_REHEARSAL_STATE, "utf8"));
        assert.deepEqual(state.sourceProfile, artifact.manifest.sourceProfile);
        assert.equal(state.transformation.verdict, "pass");
        assert.equal(state.rows.templates.length, 2);
        assert.equal(state.rows.runs.length, 2);
        // Local export uses the config-local .wrangler/state directory.
        const targetConfig = path.join(targetDirectory, "wrangler.toml");
        const targetConfiguration = readFileSync(path.join(repoRoot, "wrangler.toml"), "utf8");
        writeFileSync(targetConfig, targetConfiguration);
        const query = (statement) => run(["d1", "execute", "serp-checklists-db", "--local", "--persist-to", persistPath, "--config", targetConfig, "--json", "--command", statement]);
        const after = captureSanitizedState({ query, sourceSha256: artifact.manifest.artifact.sha256 });
        validateSanitizedStateBinding(state, after);
        // The sanitized profile deliberately excludes account rows. Add a wholly
        // synthetic dependent row so the actual account0008/users0016 catalog
        // order cannot pass merely because account is empty. Install a trigger
        // after that row; firing it during restore would violate full equality.
        if (!current) {
          query(`INSERT INTO account(id, account_id, provider_id, user_id) SELECT 'restore-account', 'literal;--account', 'credential', id FROM users LIMIT 1;
          CREATE TABLE restore_probe(id INTEGER PRIMARY KEY, value TEXT);
          INSERT INTO restore_probe VALUES(1, 'literal; /* comment */ it''s preserved');
          CREATE INDEX restore_probe_value ON restore_probe(value);
          CREATE TRIGGER restore_account_probe AFTER INSERT ON account BEGIN
            UPDATE restore_probe SET value = CASE WHEN NEW.provider_id = 'credential' THEN 'trigger; fired' ELSE 'other; value' END;
            INSERT INTO restore_probe VALUES(2, 'second; statement');
          END;
          CREATE VIEW restore_probe_view AS SELECT value FROM restore_probe;`);
        const equalityKey = "synthetic-local-recovery-key-issue120";
        const fullBefore = captureFullRecoveryState({ query, key: equalityKey });
        const recoveryExport = path.join(directory, `recovery-${current}.sql`);
        run(["d1", "export", "serp-checklists-db", "--local", "--config", targetConfig, "--output", recoveryExport]);
        const restoreDirectory = path.join(directory, `restore-${current}`); mkdirSync(restoreDirectory);
        const restoreConfig = path.join(restoreDirectory, "wrangler.toml");
        writeFileSync(restoreConfig, targetConfiguration);
        const exportSql = readFileSync(recoveryExport, "utf8");
        assert(exportSql.indexOf('INSERT INTO "account"') >= 0 && exportSql.indexOf('INSERT INTO "account"') < exportSql.search(/CREATE TABLE (?:IF NOT EXISTS )?"users"/));
        const prepared = prepareRecoveryExport(exportSql);
        withPreparedRecoveryImport({ inputPath: recoveryExport, expectedSourceSha256: prepared.metadata.sourceSha256,
          execute: file => run(["d1", "execute", "serp-checklists-db", "--local", "--config", restoreConfig, "--file", file, "--yes"]),
        });
        const restoreQuery = (statement) => run(["d1", "execute", "serp-checklists-db", "--local", "--config", restoreConfig, "--json", "--command", statement]);
        assert.deepEqual(captureFullRecoveryState({ query: restoreQuery, key: equalityKey }), fullBefore);
        const restored = captureSanitizedState({ sourceSha256: artifact.manifest.artifact.sha256, query: restoreQuery });
        validateSanitizedStateBinding(after, restored);
          restorations.push({kind:'prepared-target', sourceBoundary:'pre0024', fullStateEquality:true, exportSha256:prepared.metadata.sourceSha256});
        }
      }
    } finally { rmSync(directory, { recursive: true, force: true }); rmSync(artifactDirectory, { recursive: true, force: true }); }
    assert.equal(existsSync(directory) || existsSync(artifactDirectory), false);
}
runRealLocalD1Proof();
if (process.env.DATA_REPORT_DIR) {
  assert.equal(process.env.DATA_REGRESSION_START_COMMIT, commit);
  const reportRoot = path.join(repoRoot,'tmp/data-reports');
  const output = path.resolve(process.env.DATA_REPORT_DIR);
  assert(output === reportRoot || output.startsWith(reportRoot + path.sep));
  mkdirSync(output,{recursive:true});
  const migrationFiles = readdirSync(path.join(repoRoot, 'db/migrations')).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort();
  const target = {environment:'local',binding:'DB',databaseName:'serp-checklists-db',databaseId:'local:miniflare:full-export-recovery',synthetic:true};
  const migrationRange = {from:migrationFiles[0],to:migrationFiles.at(-1)};
  const checks = restorations.map(row => ({name:`${row.kind}:${row.sourceBoundary}`,verdict:'pass'}));
  const report = {schemaVersion:1,commit,target,migrationRange,verdict:'pass',restorations,checks,teardown:{leakedStatePaths:0,verdict:'pass'}};
  writeDataCheckReports({name:'full-export-recovery',report,reportDirectory:output,summary:`PASS local synthetic full-export recovery: binding=${target.binding} database=${target.databaseName} (${target.databaseId}) commit=${commit} migration=${migrationRange.from}->${migrationRange.to}\n${checks.map(check=>`PASS ${check.name}: complete state equality`).join('\n')}\nPASS disposable source and restore cleanup; no production data or operations.`});
}
console.log("PASS actual pre/post0024 source and prepared-target export restores, complete state equality and sanitized profiles.");
