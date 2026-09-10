import { recordIntegrationScenario } from './data-regression-report-lib.mjs';
// Explicit synthetic variants, not production-source attestation. This checks
// the public rehearsal artifact through the normal local D1/browser harness.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync, rmdirSync } from 'node:fs';
import path from 'node:path';
import { syntheticSourceDatabase, exportSyntheticRows } from './sanitizer-test-source.mjs';
import { generateSanitizedRehearsalArtifact } from './sanitizer-lib.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
const managed = Boolean(process.env.DATA_REPORT_DIR);
const evidenceRoot = managed ? path.resolve(process.env.DATA_REPORT_DIR, 'source-handler-regressions') : path.join(repoRoot, 'tmp/data-evidence');
mkdirSync(evidenceRoot, { recursive: true });
const directory = mkdtempSync(path.join(evidenceRoot, 'synthetic-retired-handler-proof-'));
// In the mandatory gate, retain reports under its allowed output directory,
// and remove temporary dataset inputs rather than publishing them as reports.
const inputBase = path.join(repoRoot, 'tmp/data-evidence');
const inputBaseExisted = existsSync(inputBase);
if (managed) mkdirSync(inputBase, { recursive: true });
const inputRoot = managed ? mkdtempSync(path.join(inputBase, 'synthetic-handler-inputs-')) : directory;
process.once('exit', () => {
  if (managed) {
    rmSync(inputRoot, { recursive: true, force: true });
    if (!inputBaseExisted && readdirSync(inputBase).length === 0) rmdirSync(inputBase);
  }
});
console.log(`Synthetic diagnostic artifacts: ${directory}`);

function runVariant(name, healthy) {
  const source = syntheticSourceDatabase(repoRoot, true);
  let artifact;
  try {
    if (healthy) {
      // Add explicit synthetic cases without repairing or dropping source rows.
      const owner = source.prepare('SELECT id FROM users LIMIT 1').get().id;
      const items = JSON.stringify([{ id: 'synthetic-section', title: 'Synthetic section', items: [{ id: 'synthetic-item', title: 'Synthetic item', contents: [] }] }]);
      source.prepare("INSERT INTO templates(id,user_id,title,items,is_public,slug,version,content_version,created_at) VALUES (?,?,?,?,0,?,1,1,'2026-09-05')").run('synthetic-healthy-template', owner, 'Synthetic healthy template', items, 'synthetic-healthy-template');
      const insert = source.prepare("INSERT INTO checklist_runs(id,user_id,template_id,title,items,status,progress,is_public,retired_items,revision,started_at,created_at) VALUES (?,?,?,?,?,'in_progress',0,0,?,1,'2026-09-05','2026-09-05')");
      insert.run('synthetic-healthy-run', owner, 'synthetic-healthy-template', 'Synthetic healthy run', items, '[]');
      insert.run('synthetic-invalid-retired-run', owner, null, 'Synthetic invalid retired run', items, JSON.stringify([{ kind: 'item', sectionId: 'synthetic-section', item: { id: false } }]));
      for (const id of ['second','runner','editor','disabled']) source.prepare("INSERT INTO users(id,email,created_at) VALUES (?,?, '2026-09-05')").run(`synthetic-${id}`, `${id}@synthetic.example`);
      for (const [id, teamOwner, archived] of [['alpha',owner,null],['beta','synthetic-second',null],['archived',owner,'2026-09-05']]) {
        source.prepare("INSERT INTO teams(id,name,created_by_user_id,created_at,archived_at) VALUES (?,?,?,'2026-09-05',?)").run(`synthetic-team-${id}`, `Synthetic ${id}`, teamOwner, archived);
        source.prepare("INSERT INTO team_members(id,team_id,user_id,role,status,created_at) VALUES (?,?,?,'owner','active','2026-09-05')").run(`synthetic-member-${id}`,`synthetic-team-${id}`,teamOwner);
      }
      for (const [user,role,status] of [['second','viewer','active'],['runner','runner','active'],['editor','editor','active'],['disabled','admin','disabled']]) source.prepare("INSERT INTO team_members(id,team_id,user_id,role,status,created_at) VALUES (?,'synthetic-team-alpha',?,?,?,'2026-09-05')").run(`synthetic-member-${user}`,`synthetic-${user}`,role,status);
      for (const [id, user, team] of [['personal-second','synthetic-second',null],['alpha',owner,'synthetic-team-alpha'],['beta','synthetic-second','synthetic-team-beta'],['archived',owner,'synthetic-team-archived']]) {
        source.prepare("INSERT INTO templates(id,user_id,title,items,is_public,slug,version,content_version,created_at,owner_type,team_id) VALUES (?,?,?,?,0,?,1,1,'2026-09-05',?,?)").run(`synthetic-template-${id}`,user,'Synthetic cohort template',items,`synthetic-template-${id}`,team ? 'team' : 'user',team);
        source.prepare("INSERT INTO checklist_runs(id,user_id,template_id,title,items,status,progress,is_public,retired_items,revision,started_at,created_at,team_id) VALUES (?,?,?,?,?,'in_progress',0,0,'[]',1,'2026-09-05','2026-09-05',?)").run(`synthetic-run-${id}`,user,`synthetic-template-${id}`,'Synthetic cohort run',items,team);
      }
      // A public template remains publicly readable after team archival, while
      // the authenticated run endpoint still requires active team membership.
      source.prepare("INSERT INTO templates(id,user_id,title,items,is_public,slug,version,content_version,created_at,owner_type,team_id) VALUES ('synthetic-archived-public',?,'Synthetic archived public',?,1,'synthetic-archived-public',1,1,'2026-09-05','team','synthetic-team-archived')").run(owner,items);
      source.prepare("INSERT INTO checklist_runs(id,user_id,template_id,title,items,status,progress,is_public,retired_items,revision,created_at,started_at,team_id) VALUES ('synthetic-archived-public-run',?,'synthetic-archived-public','Synthetic archived public run',?,'in_progress',0,1,'[]',1,'2026-09-05','2026-09-05','synthetic-team-archived')").run(owner,items);
    } else {
      // Explicit negative variant: retain every row/content value, but make all
      // source runs completed so the positive write eligibility gate must fail.
      source.exec("UPDATE checklist_runs SET status='completed' WHERE status='in_progress'");
    }
    const now = new Date();
    artifact = generateSanitizedRehearsalArtifact({ repoRoot, rawExport: exportSyntheticRows(source), sourceDatabaseId: 'b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1', sourceDate: now.toISOString().slice(0, 10), gitCommit: commit, issueNumber: 139, requestedApproverIdentity: '@devinschumacher', generatedAt: now, retentionDeadline: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(), migrationRange: { from: null, to: null }, sourceSchema: '0024_safe_template_evolution.sql' });
  } finally { source.close(); }
  const variant = path.join(directory, name);
  mkdirSync(variant);
  const inputVariant = managed ? path.join(inputRoot, name) : variant;
  if (managed) mkdirSync(inputVariant);
  const sql = path.join(inputVariant, 'source.sql'), manifest = path.join(inputVariant, 'manifest.json');
  const proof = path.join(variant, 'new-parent', 'handler.json');
  writeFileSync(sql, artifact.sql);
  writeFileSync(manifest, JSON.stringify(artifact.manifest, null, 2));
  writeFileSync(path.join(variant, 'README.txt'), `Wholly synthetic local diagnostic. Original source fixture rows/content preserved; ${healthy ? 'positive variant adds explicit healthy and invalid-retired cases' : 'negative variant changes in_progress status to completed to remove eligible runs'}. Not production data or production attestation.\n`);
  const result = spawnSync(process.execPath, ['scripts/run-playwright-smoke.mjs', '--diagnostic-selection', 'tests/e2e/sanitized-rehearsal-handler.spec.ts'], { cwd: repoRoot, encoding: 'utf8', timeout: 660000, maxBuffer: 16 * 1024 * 1024, env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: '1', DATA_REGRESSION_START_COMMIT: commit, DATA_REGRESSION_MIGRATION_FROM: 'none', DATA_REGRESSION_MIGRATION_TO: 'none', PLAYWRIGHT_SANITIZED_PAGE_NEGATIVE: name === 'broken-page' ? '1' : '0', PLAYWRIGHT_SANITIZED_REHEARSAL_SQL: sql, PLAYWRIGHT_SANITIZER_MANIFEST: manifest, PLAYWRIGHT_SANITIZER_SHA256: artifact.manifest.artifact.sha256, PLAYWRIGHT_REHEARSAL_PROOF: proof, PLAYWRIGHT_JSON_REPORT: path.join(variant, 'browser.json'), PLAYWRIGHT_TEARDOWN_REPORT: managed ? path.join(variant, 'teardown.json') : path.join(repoRoot, 'tmp/data-reports', `${path.basename(directory)}-${name}-teardown.json`) } });
  writeFileSync(path.join(variant, 'harness.log'), `${result.stdout}\n${result.stderr}`);
  return { result, proof, variant };
}

test('synthetic source with malformed retired content produces refusal and unchanged proof alongside healthy writes', () => {
  const { result, proof, variant } = runVariant('positive', true);
  assert.equal(result.status, 0, `Normal browser harness failed; inspect ${variant}/harness.log`);
  const report = JSON.parse(readFileSync(proof, 'utf8'));
  assert.equal(report.verdict, 'pass');
  assert.deepEqual(report.checks, { templateRead: true, runRead: true, templateWriteReadback: true, runWriteReadback: true });
  assert.equal(report.cohortProof.authenticatedPrincipals.length, 5);
  assert.equal(report.cohortProof.selectedCounts.teams, 3);
  assert.equal(report.cohortProof.withheldRows.length, 3);
  // This fixture has three archived rows requiring private PUT refusal for all
  // five imported principals, including the former owner with no GET access.
  const archivedWrites = report.cohortProof.cases.filter(row => row.action === 'private-write-denial' && report.cohortProof.withheldRows.some(reference => reference.kind === row.kind && reference.id === row.id));
  assert.equal(archivedWrites.length, 15);
  for (const reference of report.cohortProof.withheldRows) {
    assert.deepEqual(archivedWrites.filter(row => row.kind === reference.kind && row.id === reference.id).map(row => [row.principal, row.verdict]).sort(), [
      ['rehearsal-owner-1', 'pass'], ['rehearsal-owner-2', 'pass'], ['rehearsal-owner-3', 'pass'], ['rehearsal-owner-4', 'pass'], ['rehearsal-owner-5', 'pass'],
    ]);
  }
  assert.equal(report.cohortProof.postHandlerPreservation.verdict, 'pass');
  assert.equal(report.cohortProof.postHandlerPreservation.withheldRows, 3);
  assert.ok(report.cohortProof.measurements.privateDenials > 0);
  assert.ok(report.cohortProof.measurements.roleWriteDenials > 0);
  assert.equal(report.cohortProof.measurements.templateWrites, 4);
  assert.equal(report.cohortProof.measurements.runWrites, 4);
  assert.ok(report.cohortProof.cases.some(row => row.action === 'browser-read' && row.verdict === 'pass'));
  assert.ok(report.cohortProof.contexts.filter(row => row.write === 'pass').every(row => row.browserWriteReadback === 'pass'));
  assert.ok(report.malformedSourceChecks.some(check => check.kind === 'runs' && check.invalidItems === false && check.invalidRetiredItems === true && check.refusalStatus === 409 && check.unchanged === true && check.unchangedAfterPositiveWrites === true), 'Proof must include valid-items/invalid-retired refusal and unchanged state after healthy writes');
  recordIntegrationScenario('source-malformed-preservation');
  });

test('missing column in the imported-row consuming page fails the ordinary browser detector', () => {
  const { result, proof, variant } = runVariant('broken-page', true);
  assert.equal(result.status, 1, `Expected broken imported page refusal; inspect ${variant}/harness.log`);
  assert.match(readFileSync(path.join(variant, 'harness.log'), 'utf8'), /Imported-row browser\/API errors/);
  assert.equal(existsSync(proof), false);
  recordIntegrationScenario('source-missing-column');
  });

test('explicit no-eligible synthetic source fails without a pass artifact', () => {
  const { result, proof, variant } = runVariant('no-eligible', false);
  assert.equal(result.status, 1, `Expected no-eligible refusal; inspect ${variant}/harness.log`);
  assert.match(readFileSync(path.join(variant, 'harness.log'), 'utf8'), /Source has no eligible valid active private/);
  assert.equal(existsSync(proof), false);
  recordIntegrationScenario('source-no-eligible-refusal');
  });
