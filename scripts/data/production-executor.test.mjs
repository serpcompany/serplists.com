import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { prepareProduction, verifyRecoveryBundle, digest, approvalToken, repositoryMigrationHistory, RECOVERY_MAX_AGE_MS } from "./production-preparation-lib.mjs";

import {
  assertApprovalMatchesRequest,
  assertDeployEvidence,
  assertProductionWorkflowContext,
  assertMigrationClassification,
  createSignedEvidence,
  compareProductionInvariants,
  parseInvariantOutput,
  privacySafeOwnershipDigest,
  runProductionDataPhase,
  validateGitHubRunEvidence,
  validatePromotionEvidence,
  validateApprovalEvidence,
  validateChangeProvenance,
  validateFinalProductionRelease,
} from "./production-executor-lib.mjs";

const commit = "0123456789abcdef0123456789abcdef01234567";
const production = {
  databaseName: "serp-checklists-db",
  databaseId: "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1",
};
const context = {
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "serpcompany/serplists.com",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/main",
  GITHUB_REF_PROTECTED: "true",
  GITHUB_SHA: commit,
  GITHUB_RUN_ID: "123456",
  GITHUB_RUN_ATTEMPT: "1",
  DATA_PROTECTED_ENVIRONMENT: "production",
  CLOUDFLARE_API_TOKEN: "environment-scoped-token",
  PRODUCTION_BACKUP_ENCRYPTION_KEY: "protected-backup-encryption-key-123456",
  PRODUCTION_INVARIANT_HMAC_KEY: "protected-invariant-hmac-key-123456789",
  PRODUCTION_CANARY_EVIDENCE_HMAC_KEY: "protected-canary-evidence-key-123456789",
};

function validPromotionEvidence() {
  const baseCommit = "b".repeat(40);
  const stagingCommit = "c".repeat(40);
  const tree = "d".repeat(40);
  return {
    commit,
    classification: "backfill",
    database: production,
    pendingMigrations: ["0024_safe_template_evolution.sql"],
    migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" },
    ci: { verdict: "pass", commit, workingTreeDirty: false, migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" }, coverage: { verdict: "pass", planId: "safe-template-evolution-0024", fixtureProfile: "template-evolution-v1", affectedTables: ["templates", "checklist_runs"], invariants: ["row-counts"], declarationSha256: "a".repeat(64) } },
    ciContractCorrection: { verdict: "pass", commit, eventName: "push", comparisonBase: baseCommit },
    ciSchemaContract: { verdict: "pass", commit, runtimeDiff: { verdict: "pass" }, authorityDiff: { verdict: "pass" }, snapshotDiff: { verdict: "pass" }, migrationRange: { from: "0001_initial_schema.sql", to: "0024_safe_template_evolution.sql" } },
    rehearsal: {
      verdict: "pass",
      commit,
      target: { environment: "rehearsal", databaseId: "11111111-1111-4111-8111-111111111111" },
      migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" },
      recovery: { verdict: "pass" },
      teardown: { verdict: "pass" },
      sanitizedSource: { verdict: "pass", attestation: { verdict: "pass" }, artifactSha256: "b".repeat(64) },
      authenticatedRehearsal: { verdict: "pass", commit, sanitizerArtifactSha256: "b".repeat(64), migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" }, checks: { templateRead: true, runRead: true, templateWriteReadback: true, runWriteReadback: true, falseEmptyDetection: "pass", apiErrorDetection: "pass" } },
      coverage: { verdict: "pass", planId: "safe-template-evolution-0024", fixtureProfile: "template-evolution-v1", affectedTables: ["templates", "checklist_runs"], invariants: ["row-counts"], declarationSha256: "a".repeat(64) },
    },
    ciRun: { id: 101, head_sha: commit, conclusion: "success", name: "CI", event: "push", head_branch: "main", path: ".github/workflows/ci.yml", repository: { full_name: "serpcompany/serplists.com" } },
    stagingRun: { id: 102, head_sha: stagingCommit, conclusion: "success", name: "Protected data promotion and Pages deploy", event: "push", head_branch: "staging", path: ".github/workflows/cloudflare-pages-deploy.yml", repository: { full_name: "serpcompany/serplists.com" } },
    mergeContext: { commit, tree, baseCommit },
    changeProvenance: { mergeCommit: commit, pullRequestNumber: 100, pullRequestHeadCommit: stagingCommit, changeAuthors: ["author"] },
    staging: {
      verdict: "pass",
      commit: stagingCommit,
      tree,
      target: { environment: "staging", databaseName: "serp-checklists-staging-db", databaseId: "fcaf4325-5be7-4ead-ab60-45932a04177b" },
      migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" },
      data: { verdict: "pass" },
      schema: { verdict: "pass", ledger: { verdict: "pass" } },
      invariants: { verdict: "pass" },
      deploy: { verdict: "pass" },
      smoke: { verdict: "pass", failures: [], controlledCanaryMutationApproved: true, canaryEvidenceDigest: "a".repeat(64), checks: ["template_canary_designated", "template_write", "template_write_readback", "template_restore", "run_canary_designated", "run_write", "run_write_readback", "run_restore"].map((name) => ({ name, verdict: "pass" })) },
      teardown: { verdict: "pass" },
    },
  };
}

function validProductionSmoke() {
  return {
    verdict: "pass",
    commit,
    target: { environment: "production", ...production },
    deploymentUrl: "https://release.pages.dev",
    customDomain: "https://serplists.com",
    controlledCanaryMutationApproved: true,
    canaryEvidenceDigest: "a".repeat(64),
    failures: [],
    checks: ["template_canary_designated", "template_write", "template_write_readback", "template_restore", "run_canary_designated", "run_write", "run_write_readback", "run_restore"].map((name) => ({ name, verdict: "pass" })),
  };
}

function validApproval() {
  const riskReason = "Reviewed recovery and exact production evidence.";
  return {
    environment: "production",
    source: "github-environment-review",
    approver: "independent-reviewer",
    changeAuthors: ["author"],
    classification: "backfill",
    reviewReference: { repository: "serpcompany/serplists.com", runId: "123456", runAttempt: "1", commit, environment: "production" },
    decisionSha256: digest(riskReason),
    riskDecision: { policy: "meaningful-written-risk-reason-v1", sha256: digest(riskReason), characterCount: riskReason.length, wordCount: 6 },
  };
}

function validIdentityCheck() {
  return { environment: "production", binding: "DB", databaseName: production.databaseName, databaseId: production.databaseId, before: { databaseName: production.databaseName, databaseId: production.databaseId }, after: { databaseName: production.databaseName, databaseId: production.databaseId } };
}

function validProductionResults() {
  const steps = ["identity", "recovery-bookmark", "recovery-export", "reviewed-pending-range", "pre-invariants", "source-schema", "migration-apply", "ledger-clean", "schema-contract", "post-invariants"];
  return Object.fromEntries(steps.map((step) => [step, validStepResult(step)]));
}

function validStepResult(step) {
  const pendingMigrations = ["0024_safe_template_evolution.sql"];
  const source = { commit, database: production, ledgerSha256: digest(repositoryMigrationHistory().slice(0, -1)), appliedThrough: '0023_add_sitemap_revision_state.sql', migrationRange: { from: pendingMigrations[0], to: pendingMigrations[0] }, catalogSha256: 'a'.repeat(64), objectCount: 100 };
  const summaries = {
    'source-schema': { type: step, verdict: 'pass', ...source, proofSha256: digest(source) },
    identity: { type: step, databaseName: production.databaseName, databaseId: production.databaseId },
    "recovery-bookmark": { type: step, captured: true, bookmark: "bookmark-verified" },
    "recovery-export": { type: step, encryptedBackupSha256: "b".repeat(64), encryptedBackupByteLength: 128 },
    "reviewed-pending-range": { type: step, pendingMigrations, from: pendingMigrations[0], to: pendingMigrations[0] },
    "pre-invariants": { type: step, invariantCount: 20, appliedThrough: "0023_add_sitemap_revision_state.sql", appliedMigrations: repositoryMigrationHistory().slice(0, -1), ledgerSha256: digest(repositoryMigrationHistory().slice(0, -1)), domainDigest: "d".repeat(64) },
    "migration-apply": { type: step, appliedMigrations: pendingMigrations },
    "ledger-clean": { type: step, pendingMigrations: [], appliedThrough: pendingMigrations[0] },
    "schema-contract": { type: step, verdict: "pass", appliedThrough: pendingMigrations[0], schemaDigest: "e".repeat(64) },
    "post-invariants": { type: step, invariantCount: 20, failureCount: 0, preDomainDigest: "f".repeat(64), postDomainDigest: "f".repeat(64) },
  };
  return { verdict: "pass", artifact: `${step}.txt`, outputLength: 1, artifactByteLength: 1, artifactSha256: "a".repeat(64), summary: summaries[step], identityChecks: step === "identity" ? [] : [validIdentityCheck()] };
}

function validSignedProductionEvidence(request = validPromotionEvidence()) {
  const { approval, receipt } = preparedHandshake(validStepResult, request);
  return createSignedEvidence({ payload: { verdict: "pass", commit, classification: request.classification, database: structuredClone(production), pendingMigrations: structuredClone(request.pendingMigrations), migrationRange: structuredClone(request.migrationRange), results: validProductionResults(), approval, recovery: receipt } });
}

function preparedHandshake(run = validStepResult, request = validPromotionEvidence()) {
  const encrypted = Buffer.from("isolated encrypted export fixture");
  const preparationContext = { repository: context.GITHUB_REPOSITORY, runId: context.GITHUB_RUN_ID, runAttempt: "1", commit };
  const preparation = prepareProduction({ request, context: preparationContext, run: step => {
    const result = run(step);
    if (step === "recovery-export") result.summary = { type: step, encryptedBackupSha256: digest(encrypted), encryptedBackupByteLength: encrypted.length };
    return result;
  } });
  const bundle = { request, preparation, encrypted, expectedDigest: digest(preparation), artifactId: "123", context: preparationContext };
  const receipt = verifyRecoveryBundle(bundle);
  const decision = `Reviewed recovery and approve ${approvalToken(receipt)}`;
  const approval = { ...validApproval(), recovery: receipt, decisionSha256: digest(decision), recoveryTokenSha256: digest(approvalToken(receipt)) };
  return { preparation, receipt, approval, bundle };
}

const driftCases = {
  unknown: names => [...names.slice(0, -1), '0023_unknown.sql'],
  duplicate: names => [...names.slice(0, -1), names.at(-2)],
  reordered: names => [names[1], names[0], ...names.slice(2)],
  missing: names => names.slice(1),
  skipped: names => names.filter((_, index) => index !== 5),
  malformed: names => [...names.slice(0, -1), 'private-sentinel@example.test'],
};

describe('repository prefix and fixed recovery expiry', () => {
  it.each(Object.entries(driftCases))('blocks %s in preparation and execution even with unchanged digest', (_name, drift) => {
    const calls = [];
    const badResult = step => {
      calls.push(step);
      const result = validStepResult(step);
      if (step === 'pre-invariants') {
        result.summary.appliedMigrations = drift(result.summary.appliedMigrations);
        result.summary.ledgerSha256 = digest(result.summary.appliedMigrations);
      }
      return result;
    };
    expect(() => preparedHandshake(badResult)).toThrow();
    expect(calls).not.toContain('migration-apply');
    const handshake = preparedHandshake();
    handshake.preparation.results['pre-invariants'] = badResult('pre-invariants');
    handshake.receipt.preparationSha256 = digest(handshake.preparation);
    handshake.approval.decision = `Approved ${approvalToken(handshake.receipt)}`;
    calls.length = 0;
    expect(() => runProductionDataPhase({ ...handshake, pendingMigrations: validPromotionEvidence().pendingMigrations, run: badResult })).toThrow();
    expect(calls).toEqual([]);
  });

  const instant = Date.parse('2026-09-05T00:00:00.000Z');
  const times = [
    ['fresh', instant, true], ['one millisecond before expiry', instant - RECOVERY_MAX_AGE_MS + 1, true],
    ['boundary', instant - RECOVERY_MAX_AGE_MS, false], ['expired', instant - RECOVERY_MAX_AGE_MS - 1, false],
    ['ancient', 0, false], ['future', instant + 1, false], ['malformed', 'yesterday', false],
    ['invalid calendar', '2026-02-30T00:00:00.000Z', false], ['missing', undefined, false],
  ];
  it.each(times)('verifies %s recovery with an explicit clock', (_name, timestamp, pass) => {
    const { bundle } = preparedHandshake();
    bundle.preparation.preparedAt = typeof timestamp === 'number' ? new Date(timestamp).toISOString() : timestamp;
    bundle.expectedDigest = digest(bundle.preparation);
    bundle.clock = () => instant;
    if (pass) expect(verifyRecoveryBundle(bundle).preparationSha256).toBe(bundle.expectedDigest);
    else expect(() => verifyRecoveryBundle(bundle)).toThrow(/freshness/);
  });

  it.each(times)('runs the durable verification CLI with %s recovery and reports a safe reason', (_name, timestamp, pass) => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'recovery-expiry-cli-'));
    try {
      const { bundle } = preparedHandshake();
      bundle.preparation.preparedAt = typeof timestamp === 'number' ? new Date(timestamp).toISOString() : timestamp;
      for (const [name, value] of Object.entries({request: bundle.request, preparation: bundle.preparation})) writeFileSync(path.join(cwd, `${name}.json`), JSON.stringify(value));
      writeFileSync(path.join(cwd, 'export.enc'), bundle.encrypted);
      writeFileSync(path.join(cwd, 'clock.mjs'), `Date.now = () => ${instant};`);
      const result = spawnSync(process.execPath, ['--import', path.join(cwd, 'clock.mjs'), fileURLToPath(new URL('./verify-production-preparation.mjs', import.meta.url)), '--request', 'request.json', '--preparation', 'preparation.json', '--encrypted-export', 'export.enc', '--preparation-digest', digest(bundle.preparation), '--artifact-id', '123', '--output', 'receipt.json'], {cwd, encoding: 'utf8', env: {...context}});
      expect(result.status, result.stderr).toBe(pass ? 0 : 1);
      expect(existsSync(path.join(cwd, 'receipt.json'))).toBe(pass);
      for (const suffix of ['json', 'junit.xml', 'txt', 'md']) {
        const output = readFileSync(path.join(cwd, `tmp/recovery-verification/durable-recovery-verification.${suffix}`), 'utf8');
        if (!pass) expect(output).toContain('freshness');
      }
      const report = JSON.parse(readFileSync(path.join(cwd, 'tmp/recovery-verification/durable-recovery-verification.json')));
      expect(report.commit).toBe(commit);
      expect(report.target.databaseId).toBe(production.databaseId);
    } finally { rmSync(cwd, {recursive: true, force: true}); }
  });

  it('rejects a capture that itself consumes the entire recovery window', () => {
    let now = instant;
    expect(() => prepareProduction({ request: validPromotionEvidence(), context: {}, clock: () => now, run: step => {
      if (step === 'recovery-export') now += RECOVERY_MAX_AGE_MS;
      return validStepResult(step);
    } })).toThrow(/freshness/);
  });

  it.each(['approval wait', 'invariant delay'])('blocks same-run %s then requires new capture and new receipt approval', delay => {
    let now = instant;
    const calls = [];
    const request = validPromotionEvidence();
    const encrypted = Buffer.from('isolated encrypted fixture');
    const context = { repository: 'serpcompany/serplists.com', runId: '12', runAttempt: '1', commit };
    const capture = () => prepareProduction({ request, context, clock: () => now, run: step => {
      calls.push(`capture:${step}`);
      const result = validStepResult(step);
      if (step === 'recovery-export') result.summary = { encryptedBackupSha256: digest(encrypted), encryptedBackupByteLength: encrypted.length };
      return result;
    } });
    const preparation = capture();
    const verify = (preparation, artifactId) => verifyRecoveryBundle({ request, preparation, encrypted, expectedDigest: digest(preparation), artifactId, context, clock: () => now });
    const receipt = verify(preparation, '1');
    const approve = receipt => ({ ...validApproval(), recovery: receipt, recoveryTokenSha256: digest(approvalToken(receipt)) });
    const approval = approve(receipt);
    if (delay !== 'invariant delay') now += RECOVERY_MAX_AGE_MS;
    const execute = (preparation, receipt, approval, delayed = false) => runProductionDataPhase({ commit, database: production, preparation, receipt, approval, pendingMigrations: request.pendingMigrations, clock: () => now, run: step => {
      calls.push(`execute:${step}`);
      if (delayed && step === 'pre-invariants') now += RECOVERY_MAX_AGE_MS;
      return validStepResult(step);
    } });
    expect(() => execute(preparation, receipt, approval, delay === 'invariant delay')).toThrow(/freshness/);
    expect(calls).not.toContain('execute:migration-apply');
    const fresh = capture();
    const freshReceipt = verify(fresh, '2');
    expect(() => execute(fresh, freshReceipt, approval)).toThrow(/approval/);
    expect(execute(fresh, freshReceipt, approve(freshReceipt)).payload.verdict).toBe('pass');
    expect(calls.filter(step => step === 'execute:migration-apply')).toHaveLength(1);
  });
});

// Real local subprocesses emulate the transport only. The unmodified executor
// CLI parses their responses, performs identity checks, and writes its reports.
function executorSandbox() {
  const cwd = mkdtempSync(path.join(tmpdir(), 'executor-boundary-'));
  const bin = path.join(cwd, 'bin');
  mkdirSync(bin);
  const request = validPromotionEvidence();
  writeFileSync(path.join(cwd, 'request.json'), JSON.stringify(request));
  const configuration = { database: production, history: repositoryMigrationHistory(), sql: repositoryMigrationHistory().map(name => readFileSync(new URL(`../../db/migrations/${name}`, import.meta.url), 'utf8')), pending: request.pendingMigrations, failure: null, drift: null };
  const fake = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2), config = JSON.parse(fs.readFileSync('transport.json'));
const state = fs.existsSync('state.json') ? JSON.parse(fs.readFileSync('state.json')) : { applied: false, ledgers: 0, pendingQueries: 0 };
const command = args.join(' ');
const stage = command.includes('d1 info') ? 'identity' : command.includes('time-travel') ? 'bookmark' : command.includes('d1 export') ? 'export' : command.includes('migrations apply') ? 'migration' : command.includes('migrations list') ? 'pending' : command.includes('check:prod:d1-schema') ? 'schema' : command.includes('FROM d1_migrations') ? 'ledger' : command.includes('FROM sqlite_schema') ? 'source-schema' : 'invariant';
fs.appendFileSync('calls.txt', stage + '\\n');
if (stage === 'pending') state.pendingQueries++;
if (stage === 'identity' && config.delayFinalIdentity && state.pendingQueries >= 3) fs.writeFileSync('clock.txt', String(config.clock + 900000));
if (stage === 'schema') {
  const dir = args[args.indexOf('--report-dir') + 1];
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'raw-child.txt'), 'SQL_PRIVATE_SENTINEL user@example.test token-private');
  fs.writeFileSync('schema-directory.txt', dir);
}
if (stage === config.failure || (config.failure === 'post-invariant' && stage === 'invariant' && state.applied)) {
  console.log('SQL_PRIVATE_SENTINEL user@example.test token-private');
  console.error('SQL_PRIVATE_SENTINEL user@example.test token-private');
  process.exit(23);
}
const output = value => console.log(JSON.stringify(value));
if (stage === 'identity') output([{uuid: config.database.databaseId, name: config.database.databaseName}]);
else if (stage === 'bookmark') output({bookmark: 'local-bookmark'});
else if (stage === 'export') fs.writeFileSync(args[args.indexOf('--output') + 1], 'local fixture export');
else if (stage === 'pending') console.log(state.applied || !config.pending.length ? 'No migrations to apply!' : 'Migrations to be applied:\\n┌──────────────────────────────────┐\\n' + config.pending.map(name => '│ ' + name + ' │').join('\\n') + '\\n└──────────────────────────────────┘');
else if (stage === 'migration') { state.applied = true; console.log('applied'); }
else if (stage === 'ledger') {
  state.ledgers++;
  let names = state.applied ? config.history : config.history.slice(0, config.history.length - config.pending.length);
  if (config.drift && (!config.driftAfter || state.ledgers >= config.driftAfter)) names = config.drift;
  output([{ results: names.map((name, index) => ({id: index + 1, name})) }]);
} else if (stage === 'source-schema') {
  state.catalogQueries = (state.catalogQueries || 0) + 1;
  const db = new (require('node:sqlite').DatabaseSync)(':memory:');
  for (const sql of config.sql.slice(0, config.history.length - (state.applied ? 0 : config.pending.length))) db.exec(sql);
  if (config.sourceDrift && state.catalogQueries >= (config.sourceDriftAfter || 1)) db.exec(config.sourceDrift);
  output([{results: db.prepare(args[args.indexOf('--command') + 1]).all()}]);
  db.close();
} else if (stage === 'schema') {
  const dir = args[args.indexOf('--report-dir') + 1];
  const db = config.database;
  fs.writeFileSync(path.join(dir, 'd1-schema-production.json'), JSON.stringify({verdict: 'pass', identityChecks: [{...db, before: db, after: db}]}));
} else if (args.includes('--file')) {
  const sql = fs.readFileSync(args[args.indexOf('--file') + 1], 'utf8');
  output([{results: [...sql.matchAll(/SELECT '([^']+)' AS invariant/g)].map(match => ({invariant: match[1], total_rows: 0}))}]);
} else output([{results: []}]);
fs.writeFileSync('state.json', JSON.stringify(state));
`;
  writeFileSync(path.join(bin, 'pnpm'), fake); chmodSync(path.join(bin, 'pnpm'), 0o755);
  // Encryption is a local transport fixture too; never consume real keys.
  writeFileSync(path.join(bin, 'openssl'), `#!${process.execPath}\nconst fs=require('node:fs'); const a=process.argv; fs.writeFileSync(a[a.indexOf('-out')+1], 'encrypted local fixture');\n`);
  chmodSync(path.join(bin, 'openssl'), 0o755);
  const invoke = mode => {
    writeFileSync(path.join(cwd, 'transport.json'), JSON.stringify(configuration));
    const extra = mode === 'data' ? ['--approval', 'approval.json', '--preparation', 'preparation.json', '--encrypted-export', `reports/production-recovery-${commit}.sql.enc`, '--preparation-digest', digest(JSON.parse(readFileSync(path.join(cwd, 'preparation.json')))), '--artifact-id', '123'] : [];
    const clockArgs = configuration.clock ? ['--import', path.join(cwd, 'clock.mjs')] : [];
    return spawnSync(process.execPath, [...clockArgs, fileURLToPath(new URL('./production-executor.mjs', import.meta.url)), mode, '--request', 'request.json', '--output', mode === 'prepare' ? 'preparation.json' : 'evidence.json', '--report-dir', 'reports', ...extra], {cwd, encoding: 'utf8', env: {...context, PATH: bin, DATA_PROTECTED_ENVIRONMENT: mode === 'prepare' ? 'production-preparation' : 'production'}});
  };
  const approve = () => {
    const preparation = JSON.parse(readFileSync(path.join(cwd, 'preparation.json')));
    const receipt = verifyRecoveryBundle({request, preparation, encrypted: readFileSync(path.join(cwd, `reports/production-recovery-${commit}.sql.enc`)), expectedDigest: digest(preparation), artifactId: '123', context: preparation.context, ...(configuration.clock ? {clock: () => configuration.clock} : {})});
    writeFileSync(path.join(cwd, 'approval.json'), JSON.stringify({...validApproval(), recovery: receipt, recoveryTokenSha256: digest(approvalToken(receipt))}));
  };
  return {cwd, configuration, request, invoke, approve};
}

describe('local executor subprocess boundaries', () => {
  // These synchronous child transports can collectively occupy the worker for
  // over a minute. Let Vitest deliver report updates between scenarios.
  afterEach(() => new Promise(resolve => setImmediate(resolve)));
  it.each(['identity', 'bookmark', 'export', 'pending', 'ledger', 'invariant', 'source-schema', 'migration', 'schema', 'post-invariant', 'data:identity', 'data:pending', 'data:ledger', 'data:invariant', 'data:source-schema'])('contains real %s child failures in every report and console', failure => {
    const sandbox = executorSandbox();
    const {cwd, configuration, invoke, approve} = sandbox;
    try {
      const dataPhase = ['migration', 'schema', 'post-invariant'].includes(failure) || failure.startsWith('data:');
      if (dataPhase) {
        expect(invoke('prepare').status).toBe(0); approve();
      }
      configuration.failure = failure.replace('data:', '');
      const result = invoke(dataPhase ? 'data' : 'prepare');
      expect(result.status, result.stderr).toBe(1);
      const report = JSON.parse(readFileSync(path.join(cwd, 'reports/production-data-promotion.json')));
      expect(report.failure.exitStatus).toBe(23);
      for (const output of [result.stdout, result.stderr, ...['json', 'junit.xml', 'txt', 'md'].map(suffix => readFileSync(path.join(cwd, `reports/production-data-promotion.${suffix}`), 'utf8'))]) {
        for (const sentinel of ['SQL_PRIVATE_SENTINEL', 'user@example.test', 'token-private']) expect(output).not.toContain(sentinel);
      }
      expect(existsSync(path.join(cwd, 'evidence.json'))).toBe(false);
      const calls = readFileSync(path.join(cwd, 'calls.txt'), 'utf8').trim().split('\n');
      expect(calls.filter(call => call === 'migration')).toHaveLength(['migration', 'schema', 'post-invariant'].includes(failure) ? 1 : 0);
      if (failure === 'schema') expect(existsSync(readFileSync(path.join(cwd, 'schema-directory.txt'), 'utf8'))).toBe(false);
    } finally { rmSync(cwd, {recursive: true, force: true}); }
  });

  it('checks the injected clock after the final identity subprocess and blocks expiry with zero writes', () => {
    const {cwd, configuration, invoke, approve} = executorSandbox();
    try {
      configuration.clock = Date.parse('2026-09-05T00:00:00.000Z');
      writeFileSync(path.join(cwd, 'clock.txt'), String(configuration.clock));
      writeFileSync(path.join(cwd, 'clock.mjs'), `import { readFileSync } from 'node:fs'; Date.now = () => Number(readFileSync('clock.txt', 'utf8'));`);
      expect(invoke('prepare').status).toBe(0); approve();
      configuration.delayFinalIdentity = true;
      const result = invoke('data');
      expect(result.status).toBe(1);
      for (const suffix of ['json', 'junit.xml', 'txt', 'md']) expect(readFileSync(path.join(cwd, `reports/production-data-promotion.${suffix}`), 'utf8')).toContain('freshness');
      expect(readFileSync(path.join(cwd, 'calls.txt'), 'utf8').split('\n')).not.toContain('migration');
    } finally { rmSync(cwd, {recursive: true, force: true}); }
  });

  it.each(Object.entries(driftCases))('rejects %s ledger during prepare and the last read before mutation', (_name, drift) => {
    for (const phase of ['prepare', 'data']) {
      const {cwd, configuration, invoke, approve} = executorSandbox();
      try {
        if (phase === 'data') { expect(invoke('prepare').status).toBe(0); approve(); }
        configuration.drift = drift(configuration.history.slice(0, -1));
        // Preparation has invariant + source-before/after ledger reads;
        // execution repeats those before the final pre-write ledger read.
        configuration.driftAfter = phase === 'data' ? 7 : 1;
        const result = invoke(phase);
        expect(result.status, result.stderr).toBe(1);
        expect(readFileSync(path.join(cwd, 'calls.txt'), 'utf8').split('\n')).not.toContain('migration');
      } finally { rmSync(cwd, {recursive: true, force: true}); }
    }
  });

  it.each([1, 2, 3])('rejects live trigger drift at catalog read %s before any apply subprocess', sourceDriftAfter => {
    const {cwd, configuration, invoke, approve} = executorSandbox();
    try {
      configuration.sourceDrift = 'CREATE TRIGGER private_sentinel AFTER UPDATE ON templates BEGIN DELETE FROM checklist_runs WHERE user_id=NEW.user_id; END';
      configuration.sourceDriftAfter = sourceDriftAfter;
      if (sourceDriftAfter > 1) { expect(invoke('prepare').status).toBe(0); approve(); }
      const result = invoke(sourceDriftAfter === 1 ? 'prepare' : 'data');
      expect(result.status, result.stderr).toBe(1);
      expect(readFileSync(path.join(cwd, 'calls.txt'), 'utf8').split('\n')).not.toContain('migration');
      for (const suffix of ['json', 'junit.xml', 'txt', 'md']) {
        const report = readFileSync(path.join(cwd, `reports/production-data-promotion.${suffix}`), 'utf8');
        expect(report).toContain('source catalog');
        expect(report).not.toContain('private_sentinel');
      }
    } finally { rmSync(cwd, {recursive: true, force: true}); }
  });

  it.each([false, true])('completes full prepare/approval/execute with no migrations=%s', noMigrations => {
    const {cwd, configuration, request, invoke, approve} = executorSandbox();
    try {
      if (noMigrations) {
        configuration.pending = []; request.pendingMigrations = [];
        for (const value of [request, request.ci, request.rehearsal, request.rehearsal.authenticatedRehearsal, request.staging]) value.migrationRange = {from: null, to: null};
        writeFileSync(path.join(cwd, 'request.json'), JSON.stringify(request));
      }
      const prepared = invoke('prepare'); expect(prepared.status, prepared.stderr).toBe(0);
      approve();
      const executed = invoke('data'); expect(executed.status, executed.stderr).toBe(0);
      expect(JSON.parse(readFileSync(path.join(cwd, 'evidence.json'))).payload.verdict).toBe('pass');
    } finally { rmSync(cwd, {recursive: true, force: true}); }
  });
});

describe("protected production executor", () => {
  it('rejects source proof replay for another request even when invariant metadata supplies the old identity', () => {
    const request = validPromotionEvidence();
    request.database = { ...production, databaseId: '11111111-1111-4111-8111-111111111111' };
    expect(() => preparedHandshake(step => {
      const result = validStepResult(step);
      if (step === 'pre-invariants') result.summary.database = production;
      return result;
    }, request)).toThrow(/Source schema proof/);
  });

  it("rejects local, push, unprotected, mismatched-commit, and legacy credential contexts", () => {
    for (const env of [
      {},
      { ...context, GITHUB_EVENT_NAME: "push" },
      { ...context, GITHUB_REF_PROTECTED: "false" },
      { ...context, GITHUB_SHA: "f".repeat(40) },
      { ...context, CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_API_KEY: "legacy", CLOUDFLARE_EMAIL: "owner@example.test" },
    ]) {
      expect(() => assertProductionWorkflowContext({ env, expectedCommit: commit })).toThrow();
    }
  });

  it("requires distinct production invariant, backup, and canary keys", () => {
    expect(assertProductionWorkflowContext({ env: context, expectedCommit: commit })).toMatchObject({
      commit,
      protectedEnvironment: "production",
    });
    expect(() => assertProductionWorkflowContext({
      env: { ...context, PRODUCTION_INVARIANT_HMAC_KEY: "" },
      expectedCommit: commit,
    })).toThrow(/invariant HMAC key is missing/i);
    expect(() => assertProductionWorkflowContext({
      env: {
        ...context,
        PRODUCTION_INVARIANT_HMAC_KEY: context.PRODUCTION_BACKUP_ENCRYPTION_KEY,
      },
      expectedCommit: commit,
    })).toThrow(/must be separate/i);
  });

  it.each([
    ["backup and invariant", ["PRODUCTION_BACKUP_ENCRYPTION_KEY", "PRODUCTION_INVARIANT_HMAC_KEY"], ["backup encryption", "invariant HMAC"]],
    ["backup and canary", ["PRODUCTION_BACKUP_ENCRYPTION_KEY", "PRODUCTION_CANARY_EVIDENCE_HMAC_KEY"], ["backup encryption", "canary evidence HMAC"]],
    ["invariant and canary", ["PRODUCTION_INVARIANT_HMAC_KEY", "PRODUCTION_CANARY_EVIDENCE_HMAC_KEY"], ["invariant HMAC", "canary evidence HMAC"]],
    ["all three", ["PRODUCTION_BACKUP_ENCRYPTION_KEY", "PRODUCTION_INVARIANT_HMAC_KEY", "PRODUCTION_CANARY_EVIDENCE_HMAC_KEY"], ["backup encryption", "invariant HMAC", "canary evidence HMAC"]],
  ])("blocks %s key reuse before privileged operations and reports only roles", (_name, names, roles) => {
    const cwd = mkdtempSync(path.join(tmpdir(), "production-key-separation-"));
    try {
      const reportDirectory = path.join(cwd, "reports");
      const requestPath = path.join(cwd, "request.json");
      writeFileSync(requestPath, JSON.stringify(validPromotionEvidence()));
      const env = { ...context, PATH: cwd };
      for (const name of names) env[name] = context[names[0]];
      const result = spawnSync(process.execPath, [
        fileURLToPath(new URL("./production-executor.mjs", import.meta.url)),
        "data", "--request", requestPath,
        "--output", path.join(cwd, "evidence.json"), "--report-dir", reportDirectory,
      ], { cwd, env, encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(existsSync(path.join(cwd, "evidence.json"))).toBe(false);
      const report = JSON.parse(readFileSync(path.join(reportDirectory, "production-data-promotion.json"), "utf8"));
      expect(report.operations).toEqual({ activeStep: null, attemptedSteps: [], completedSteps: [], results: {} });
      expect(report.failure.stage).toBe('production-configuration');
      const outputs = [result.stdout, result.stderr];
      for (const suffix of ["json", "junit.xml", "txt", "md"]) {
        const output = readFileSync(path.join(reportDirectory, `production-data-promotion.${suffix}`), "utf8");
        outputs.push(output);
      }
      for (const output of outputs) {
        for (const name of Object.keys(context).filter((key) => key.endsWith("_KEY"))) {
          expect(output).not.toContain(env[name]);
        }
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it.each([undefined, "", "too-short"])("rejects missing or short canary key %s without falling back to staging", (key) => {
    expect(() => assertProductionWorkflowContext({
      env: { ...context, PRODUCTION_CANARY_EVIDENCE_HMAC_KEY: key, STAGING_CANARY_EVIDENCE_HMAC_KEY: context.PRODUCTION_CANARY_EVIDENCE_HMAC_KEY },
      expectedCommit: commit,
    })).toThrow(/canary evidence HMAC key is missing/);
  });

  it("requires exact passing CI and rehearsal evidence for the requested commit and migration range", () => {
    const evidence = validPromotionEvidence();

    expect(validatePromotionEvidence(evidence)).toEqual(evidence);
    for (const invalid of [
      { ...evidence, classification: "unclassified" },
      { ...evidence, ci: { ...evidence.ci, verdict: "fail" } },
      { ...evidence, ci: { ...evidence.ci, coverage: { ...evidence.ci.coverage, affectedTables: ["usage_analytics"] } } },
      { ...evidence, ciContractCorrection: { ...evidence.ciContractCorrection, eventName: "local-working-tree" } },
      { ...evidence, ciContractCorrection: { ...evidence.ciContractCorrection, comparisonBase: null } },
      { ...evidence, ciRun: { ...evidence.ciRun, event: "workflow_dispatch" } },
      { ...evidence, staging: { ...evidence.staging, tree: "e".repeat(40) } },
      { ...evidence, staging: { ...evidence.staging, teardown: { verdict: "fail" } } },
      { ...evidence, ciSchemaContract: { ...evidence.ciSchemaContract, authorityDiff: { verdict: "fail" } } },
      { ...evidence, rehearsal: { ...evidence.rehearsal, commit: "f".repeat(40) } },
      { ...evidence, rehearsal: { ...evidence.rehearsal, target: { environment: "production", databaseId: production.databaseId } } },
      { ...evidence, rehearsal: { ...evidence.rehearsal, recovery: { verdict: "fail" } } },
    ]) expect(() => validatePromotionEvidence(invalid)).toThrow();
  });

  it("supports an explicit no-migrations release only with a proven clean ledger", () => {
    const evidence = validPromotionEvidence();
    evidence.classification = "additive";
    evidence.migrationRange = { from: null, to: null };
    evidence.pendingMigrations = [];
    evidence.ci.migrationRange = { from: null, to: null };
    evidence.ci.coverage = { ...evidence.ci.coverage, planId: "application-only-at-0024" };
    evidence.rehearsal.migrationRange = { from: null, to: null };
    evidence.rehearsal.coverage = evidence.ci.coverage;
    evidence.rehearsal.authenticatedRehearsal.migrationRange = { from: null, to: null };
    evidence.staging.migrationRange = { from: null, to: null };
    expect(validatePromotionEvidence(evidence).pendingMigrations).toEqual([]);
  });

  it("rejects artifacts unless GitHub identifies the exact successful workflow and commit", () => {
    const metadata = { id: 123, head_sha: commit, conclusion: "success", name: "CI", event: "push", head_branch: "main", path: ".github/workflows/ci.yml", repository: { full_name: "serpcompany/serplists.com" } };
    const options = { metadata, commit, workflowName: "CI", eventName: "push", headBranch: "main", workflowPath: ".github/workflows/ci.yml" };
    expect(validateGitHubRunEvidence(options)).toEqual(metadata);
    for (const invalid of [
      { ...metadata, head_sha: "f".repeat(40) },
      { ...metadata, conclusion: "failure" },
      { ...metadata, name: "Untrusted workflow" },
      { ...metadata, event: "workflow_dispatch" },
      { ...metadata, head_branch: "staging" },
      { ...metadata, path: ".github/workflows/untrusted.yml" },
      { ...metadata, repository: { full_name: "other/repo" } },
    ]) expect(() => validateGitHubRunEvidence({ ...options, metadata: invalid })).toThrow();
  });

  it("derives the highest migration risk and rejects under-classification", () => {
    expect(assertMigrationClassification({ requested: "additive", sqlTexts: [] })).toBe("additive");
    expect(assertMigrationClassification({ requested: "backfill", sqlTexts: ["ALTER TABLE x ADD COLUMN y TEXT; UPDATE x SET y='a';"] })).toBe("backfill");
    expect(() => assertMigrationClassification({ requested: "additive", sqlTexts: ["DELETE FROM x;"] })).toThrow(/destructive/i);
  });

  it("classifies SQLite conflict-replacement forms as destructive", () => {
    for (const sql of [
      "REPLACE INTO templates(id, title) VALUES ('t', 'replacement');",
      'REPLACE INTO main."templates"(id) VALUES (\'t\');',
      "INSERT OR REPLACE INTO [templates](id) VALUES ('t');",
      "INSERT /* conflict policy */ OR /* delete then insert */ REPLACE INTO `main`.`templates`(id) VALUES ('t');",
    ]) {
      expect(() => assertMigrationClassification({ requested: "backfill", sqlTexts: [sql] })).toThrow(/destructive/i);
      expect(assertMigrationClassification({ requested: "destructive", sqlTexts: [sql] })).toBe("destructive");
    }
    expect(assertMigrationClassification({ requested: "backfill", sqlTexts: ["INSERT OR IGNORE INTO templates(id) VALUES ('t');"] })).toBe("backfill");
  });

  it("classifies only positively allowlisted compatible schema additions as additive", () => {
    for (const sql of [
      "CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, value TEXT NOT NULL);",
      "CREATE INDEX IF NOT EXISTS idx_events_value ON audit_events(value);",
      "ALTER TABLE templates ADD COLUMN subtitle TEXT;",
      "ALTER TABLE templates ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;",
      "PRAGMA defer_foreign_keys=TRUE; BEGIN TRANSACTION; COMMIT;",
      "-- DROP TABLE ignored_comment\nALTER TABLE templates ADD COLUMN note TEXT DEFAULT 'semi;colon';",
    ]) {
      expect(assertMigrationClassification({ requested: "additive", sqlTexts: [sql] })).toBe("additive");
    }
  });

  it("classifies CREATE TABLE AS SELECT as a data backfill", () => {
    for (const sql of [
      "CREATE TABLE copied_templates AS SELECT * FROM templates;",
      "CREATE TABLE copied AS WITH source(v) AS (SELECT 7) SELECT v FROM source;",
      "CREATE TABLE copied AS/*split*/SELECT 9 AS v;",
    ]) {
      expect(() => assertMigrationClassification({ requested: "additive", sqlTexts: [sql] })).toThrow(/backfill/i);
      expect(assertMigrationClassification({ requested: "backfill", sqlTexts: [sql] })).toBe("backfill");
    }
  });

  it("elevates unique indexes and required columns without safe defaults", () => {
    for (const sql of [
      "CREATE UNIQUE INDEX idx_templates_slug ON templates(slug);",
      "ALTER TABLE templates ADD COLUMN required_value TEXT NOT NULL;",
      "ALTER TABLE templates ADD COLUMN required_value TEXT NOT NULL DEFAULT NULL;",
      "PRAGMA foreign_keys=OFF;",
    ]) {
      expect(() => assertMigrationClassification({ requested: "additive", sqlTexts: [sql] })).toThrow(/destructive/i);
      expect(assertMigrationClassification({ requested: "destructive", sqlTexts: [sql] })).toBe("destructive");
    }
  });

  it("fails unknown executable syntax closed as irreversible and uses highest mixed risk", () => {
    expect(() => assertMigrationClassification({ requested: "destructive", sqlTexts: ["VACUUM;"] })).toThrow(/irreversible/i);
    expect(assertMigrationClassification({ requested: "irreversible", sqlTexts: ["VACUUM;"] })).toBe("irreversible");
    expect(assertMigrationClassification({
      requested: "destructive",
      sqlTexts: [
        "CREATE TABLE safe_new (id TEXT); UPDATE templates SET title='changed';",
        "ALTER TABLE templates RENAME COLUMN title TO old_title;",
      ],
    })).toBe("destructive");
    expect(assertMigrationClassification({
      requested: "destructive",
      sqlTexts: ["CREATE TABLE safe_new (id TEXT);", "DELETE FROM templates;"],
    })).toBe("destructive");
  });

  it("binds approval independence to every actual change author, not the dispatcher", () => {
    const productionReview = (login, comment = "Reviewed recovery and invariant evidence.") => ({
      state: "approved", comment, user: { login, type: "User" }, environments: [{ name: "production" }],
    });
    const changeAuthors = ["pr-author", "commit-author"];
    const recoveryToken = "recovery:123456:1:123:" + "a".repeat(64);
    const reviewContext = { repository: "serpcompany/serplists.com", runId: "123456", runAttempt: "1", commit };
    const withContext = (values) => ({ ...values, recoveryToken, reviewContext });
    expect(validateApprovalEvidence(withContext({ reviews: [productionReview("independent-reviewer", `Reviewed recovery and invariant evidence. ${recoveryToken}`)], classification: "backfill", actor: "dispatcher", changeAuthors })).approver).toBe("independent-reviewer");
    expect(validateApprovalEvidence(withContext({ reviews: [productionReview("independent-reviewer", `復旧証跡と書き込みリスクを確認し、本番変更を承認します。 ${recoveryToken}`)], classification: "backfill", actor: "dispatcher", changeAuthors })).riskDecision.wordCount).toBeGreaterThanOrEqual(3);
    expect(() => validateApprovalEvidence(withContext({ reviews: [productionReview("independent-reviewer", recoveryToken)], classification: "backfill", actor: "dispatcher", changeAuthors }))).toThrow(/written production review decision/i);
    expect(() => validateApprovalEvidence(withContext({ reviews: [productionReview("pr-author", recoveryToken)], classification: "additive", actor: "different-dispatcher", changeAuthors }))).toThrow(/independent/i);
    expect(() => validateApprovalEvidence(withContext({ reviews: [productionReview("COMMIT-AUTHOR", recoveryToken)], classification: "additive", actor: "dispatcher", changeAuthors }))).toThrow(/independent/i);
    expect(() => validateApprovalEvidence(withContext({ reviews: [{ ...productionReview("independent", recoveryToken), environments: [{ name: "staging" }] }], classification: "additive", actor: "dispatcher", changeAuthors }))).toThrow(/production/i);
    expect(() => validateApprovalEvidence(withContext({ reviews: [productionReview("independent", `short ${recoveryToken}`)], classification: "destructive", actor: "dispatcher", changeAuthors }))).toThrow(/decision/i);
  });

  it("rejects mismatched approval before any protected data mutation can start", () => {
    const request = validPromotionEvidence();
    expect(assertApprovalMatchesRequest({ approval: validApproval(), request })).toEqual(validApproval());
    expect(() => assertApprovalMatchesRequest({ approval: { ...validApproval(), approver: "author" }, request })).toThrow(/independent/i);
    expect(() => assertApprovalMatchesRequest({ approval: { ...validApproval(), classification: "additive" }, request })).toThrow(/classification/i);
    expect(() => assertApprovalMatchesRequest({ approval: { ...validApproval(), changeAuthors: ["other"] }, request })).toThrow(/authors/i);
    expect(() => assertApprovalMatchesRequest({ approval: { ...validApproval(), reviewReference: { ...validApproval().reviewReference, commit: "f".repeat(40) } }, request })).toThrow(/reference/i);
    expect(() => assertApprovalMatchesRequest({ approval: { ...validApproval(), riskDecision: { ...validApproval().riskDecision, wordCount: 0 } }, request })).toThrow(/decision/i);
    const destructiveRequest = { ...request, classification: "destructive" };
    const destructiveApproval = { ...validApproval(), classification: "destructive" };
    expect(assertApprovalMatchesRequest({ approval: destructiveApproval, request: destructiveRequest })).toEqual(destructiveApproval);
    expect(() => assertApprovalMatchesRequest({ approval: { ...destructiveApproval, riskDecision: { ...destructiveApproval.riskDecision, sha256: null } }, request: destructiveRequest })).toThrow(/decision/i);
  });

  it("requires distinct verified repository-admin production approval for irreversible changes", () => {
    const recoveryToken = "recovery:123456:1:123:" + "a".repeat(64);
    const review = (login, environment = "production") => ({ state: "approved", comment: `Reviewed irreversible recovery evidence. ${recoveryToken}`, user: { login, type: "User" }, environments: [{ name: environment }] });
    const base = { reviews: [review("independent"), review("repo-owner", "production-owner-approval")], classification: "irreversible", actor: "dispatcher", changeAuthors: ["author"], repositoryOwnerApprover: "repo-owner", recoveryToken, reviewContext: { repository: "serpcompany/serplists.com", runId: "123456", runAttempt: "1", commit } };
    expect(validateApprovalEvidence({ ...base, ownerPermission: { permission: "admin", user: { login: "repo-owner" } } })).toMatchObject({ approver: "independent", repositoryOwnerApprover: "repo-owner" });
    expect(() => validateApprovalEvidence({ ...base, ownerPermission: { permission: "write", user: { login: "repo-owner" } } })).toThrow(/admin/i);
    expect(() => validateApprovalEvidence({ ...base, reviews: [review("repo-owner", "production-owner-approval")], ownerPermission: { permission: "admin", user: { login: "repo-owner" } } })).toThrow(/distinct/i);
    expect(() => validateApprovalEvidence({ ...base, changeAuthors: ["repo-owner"], ownerPermission: { permission: "admin", user: { login: "repo-owner" } } })).toThrow(/author/i);
  });

  it("accepts ordinary unsigned constituent commits while binding exact verified merge provenance and every author", () => {
    const pulls = [{ number: 100, merged_at: "2026-09-05T00:00:00Z", merge_commit_sha: commit, base: { ref: "main" }, head: { sha: "c".repeat(40) }, user: { login: "PR-Author" } }];
    const mergeCommit = {
      sha: commit,
      author: { login: "merge-author", type: "User" },
      committer: { login: "web-flow", type: "User" },
      commit: { verification: { verified: true, reason: "valid" } },
    };
    const mergeAuthors = { data: { repository: { object: { oid: commit, authors: { nodes: [{ user: { login: "merge-author" } }], pageInfo: { hasNextPage: false } } } } } };
    const commits = [
      { sha: "1".repeat(40), author: { login: "commit-author" }, committer: { login: "trusted-committer" }, commit: { message: "Change\n\nCo-authored-by: Human <human@example.test>", verification: { verified: false } } },
      { sha: "2".repeat(40), author: { login: "pr-author" }, committer: { login: "trusted-committer" }, commit: { message: "Other", verification: { verified: false } } },
    ];
    const commitAuthors = [{
      data: { repository: { pullRequest: { commits: { nodes: [
        { commit: { oid: "1".repeat(40), authors: { nodes: [{ user: { login: "commit-author" } }, { user: { login: "co-author" } }], pageInfo: { hasNextPage: false } } } },
        { commit: { oid: "2".repeat(40), authors: { nodes: [{ user: { login: "pr-author" } }], pageInfo: { hasNextPage: false } } } },
      ] } } } },
    }];
    const provenance = validateChangeProvenance({ pulls, commits, commitAuthors, mergeCommit, mergeAuthors, expectedCommit: commit });
    expect(provenance).toEqual({
      pullRequestNumber: 100,
      pullRequestHeadCommit: "c".repeat(40),
      mergeCommit: commit,
      changeAuthors: ["co-author", "commit-author", "merge-author", "pr-author", "trusted-committer", "web-flow"],
      mergeProvenance: { verification: "verified", author: "merge-author", committer: "web-flow", authors: ["merge-author"] },
    });

    const productionReview = (login) => ({
      state: "approved",
      comment: `Reviewed exact merge and recovery evidence. recovery:123456:1:123:${"a".repeat(64)}`,
      user: { login, type: "User" },
      environments: [{ name: "production" }],
    });
    for (const author of ["pr-author", "commit-author", "merge-author"]) {
      expect(() => validateApprovalEvidence({
        reviews: [productionReview(author)],
        classification: "backfill",
        actor: "dispatcher",
        changeAuthors: provenance.changeAuthors,
        recoveryToken: `recovery:123456:1:123:${"a".repeat(64)}`,
        reviewContext: { repository: "serpcompany/serplists.com", runId: "123456", runAttempt: "1", commit },
      })).toThrow(/independent/i);
    }

    expect(() => validateChangeProvenance({ pulls: [], commits, commitAuthors, mergeCommit, mergeAuthors, expectedCommit: commit })).toThrow(/pull request/i);
    expect(() => validateChangeProvenance({ pulls: [{ ...pulls[0], base: { ref: "staging" } }], commits, commitAuthors, mergeCommit, mergeAuthors, expectedCommit: commit })).toThrow(/pull request/i);
    expect(() => validateChangeProvenance({ pulls, commits, commitAuthors, mergeCommit: { ...mergeCommit, sha: "f".repeat(40) }, mergeAuthors, expectedCommit: commit })).toThrow(/merge provenance/i);
    expect(() => validateChangeProvenance({ pulls, commits, commitAuthors, mergeCommit: { ...mergeCommit, commit: { verification: { verified: false } } }, mergeAuthors, expectedCommit: commit })).toThrow(/merge provenance/i);
    expect(() => validateChangeProvenance({ pulls, commits, commitAuthors, mergeCommit: { ...mergeCommit, author: null }, mergeAuthors, expectedCommit: commit })).toThrow(/attributed/i);
    expect(() => validateChangeProvenance({ pulls, commits: [{ ...commits[0], author: null }, commits[1]], commitAuthors, mergeCommit, mergeAuthors, expectedCommit: commit })).toThrow(/author/i);
    const unresolvedCoauthor = structuredClone(commitAuthors);
    unresolvedCoauthor[0].data.repository.pullRequest.commits.nodes[0].commit.authors.nodes.push({ user: null });
    expect(() => validateChangeProvenance({ pulls, commits, commitAuthors: unresolvedCoauthor, mergeCommit, mergeAuthors, expectedCommit: commit })).toThrow(/co-author/i);
    const unresolvedMergeCoauthor = structuredClone(mergeAuthors);
    unresolvedMergeCoauthor.data.repository.object.authors.nodes.push({ user: null });
    expect(() => validateChangeProvenance({ pulls, commits, commitAuthors, mergeCommit, mergeAuthors: unresolvedMergeCoauthor, expectedCommit: commit })).toThrow(/co-author/i);
  });

  it.each([
    ["missing", null, "backfill", ""],
    ["malformed", "not json", "backfill", ""],
    ["self approval", JSON.stringify([{ state: "approved", user: { login: "author" } }]), "backfill", ""],
    ["irreversible owner missing", JSON.stringify([{ state: "approved", user: { login: "independent" } }]), "irreversible", "repo-owner"],
  ])("writes durable JSON/JUnit/human reports for %s", (_name, reviews, classification, owner) => {
    const cwd = mkdtempSync(path.join(tmpdir(), "approval-failure-"));
    const reviewPath = path.join(cwd, "reviews.json");
    if (reviews !== null) writeFileSync(reviewPath, reviews);
    try {
      const result = spawnSync(process.execPath, [
        fileURLToPath(new URL("./capture-production-approval.mjs", import.meta.url)),
        "--reviews", reviewPath,
        "--output", path.join(cwd, "approval.json"),
      ], {
        cwd,
        env: {
          ...process.env,
          GITHUB_ACTOR: "author",
          GITHUB_SHA: commit,
          REQUEST_CLASSIFICATION: classification,
          REQUEST_APPROVAL_DECISION: "Reviewed recovery and irreversible decision.",
          REPOSITORY_OWNER_APPROVER: owner,
        },
      });
      expect(result.status).toBe(1);
      for (const suffix of ["json", "junit.xml", "txt"]) {
        expect(existsSync(path.join(cwd, "tmp/data-reports/production", `production-approval.${suffix}`))).toBe(true);
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("preserves exact request identity and range when evidence validation fails", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "production-prevalidation-failure-"));
    const reportDirectory = path.join(cwd, "reports");
    const requestPath = path.join(cwd, "request.json");
    const approvalPath = path.join(cwd, "approval.json");
    try {
      const request = validPromotionEvidence();
      request.ci.verdict = "fail";
      writeFileSync(requestPath, JSON.stringify(request));
      writeFileSync(approvalPath, "{}\n");
      const result = spawnSync(process.execPath, [
        fileURLToPath(new URL("./production-executor.mjs", import.meta.url)),
        "data", "--request", requestPath, "--approval", approvalPath,
        "--output", path.join(cwd, "evidence.json"), "--report-dir", reportDirectory,
      ], { cwd, env: { ...process.env, ...context } });
      expect(result.status).toBe(1);
      const report = JSON.parse(readFileSync(path.join(reportDirectory, "production-data-promotion.json"), "utf8"));
      expect(report).toMatchObject({
        verdict: "fail",
        commit,
        target: { environment: "production", ...production },
        migrationRange: request.migrationRange,
        operations: { activeStep: null, attemptedSteps: [], completedSteps: [], results: {} },
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("preserves completed and attempted operation results when a later production step fails", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "production-partial-failure-"));
    const reportDirectory = path.join(cwd, "reports");
    const requestPath = path.join(cwd, "request.json");
    const approvalPath = path.join(cwd, "approval.json");
    const fakeBin = path.join(cwd, "bin");
    const fakePnpm = path.join(fakeBin, "pnpm");
    try {
      mkdirSync(fakeBin);
      writeFileSync(requestPath, JSON.stringify(validPromotionEvidence()));
      writeFileSync(approvalPath, JSON.stringify(validApproval()));
      writeFileSync(fakePnpm, `#!/bin/sh
case "$*" in
  *"d1 info"*) printf '%s\\n' '[{"uuid":"${production.databaseId}","name":"${production.databaseName}"}]' ;;
  *) exit 23 ;;
esac
`);
      chmodSync(fakePnpm, 0o755);
      const result = spawnSync(process.execPath, [
        fileURLToPath(new URL("./production-executor.mjs", import.meta.url)),
        "prepare", "--request", requestPath,
        "--output", path.join(cwd, "evidence.json"), "--report-dir", reportDirectory,
      ], {
        cwd,
        env: { ...process.env, ...context, DATA_PROTECTED_ENVIRONMENT: "production-preparation", PATH: `${fakeBin}:${process.env.PATH}` },
      });
      expect(result.status).toBe(1);
      const report = JSON.parse(readFileSync(path.join(reportDirectory, "production-data-promotion.json"), "utf8"));
      expect(report).toMatchObject({
        verdict: "fail",
        commit,
        target: { environment: "production", ...production },
        operations: {
          activeStep: "recovery-bookmark",
          attemptedSteps: ["identity", "recovery-bookmark"],
          completedSteps: ["identity"],
          results: {
            identity: { verdict: "pass" },
            "recovery-bookmark": { verdict: "fail" },
          },
        },
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("runs recovery, reviewed migration, ledger, schema, and invariant gates in order before signing deploy evidence", () => {
    const calls = [];
    const result = runProductionDataPhase({
      ...preparedHandshake(),
      commit,
      database: production,
      pendingMigrations: ["0024_safe_template_evolution.sql"],
      classification: "backfill",
      run: (step) => {
        calls.push(step);
        return validStepResult(step);
      },
    });

    expect(calls).toEqual([
      "identity", "reviewed-pending-range",
      "pre-invariants", "source-schema", "migration-apply", "ledger-clean", "schema-contract", "post-invariants",
    ]);
    expect(assertDeployEvidence({ signedEvidence: result, commit, database: production })).toMatchObject({
      verdict: "pass",
      commit,
      database: production,
    });
  });

  it("never reaches migration or deploy evidence when a prerequisite fails", () => {
    const calls = [];
    expect(() => runProductionDataPhase({
      ...preparedHandshake(),
      commit,
      database: production,
      pendingMigrations: ["0024_safe_template_evolution.sql"],
      run: (step) => {
        calls.push(step);
        return { ...validStepResult(step), verdict: step === "pre-invariants" ? "fail" : "pass" };
      },
    })).toThrow(/pre-invariants/i);
    expect(calls).not.toContain("migration-apply");
  });

  it.each(["success", "upload unavailable", "digest mismatch", "export mismatch", "request mismatch", "wrong attempt", "changed ledger", "changed identity", "changed pending", "denied approval", "missing approval"])("orchestrates durable recovery -> approval -> execution: %s", scenario => {
    const calls = [];
    const orchestrate = () => {
      const handshake = preparedHandshake(step => { calls.push(`prepare:${step}`); return validStepResult(step); });
      calls.push("upload");
      if (scenario === "upload unavailable") throw new Error("upload unavailable");
      // A byte-for-byte downloaded copy is the storage boundary, not a local path assertion.
      const downloaded = structuredClone(handshake.bundle);
      downloaded.encrypted = Buffer.from(downloaded.encrypted);
      if (scenario === "digest mismatch") downloaded.expectedDigest = "0".repeat(64);
      if (scenario === "export mismatch") downloaded.encrypted = Buffer.from("corrupted");
      if (scenario === "request mismatch") downloaded.request.commit = "0".repeat(40);
      if (scenario === "wrong attempt") downloaded.context.runAttempt = "2";
      verifyRecoveryBundle(downloaded);
      calls.push("durable-verified", "approval");
      if (scenario === "denied approval") throw new Error("denied");
      if (scenario === "missing approval") handshake.approval = null;
      return runProductionDataPhase({ ...handshake, commit, database: production, pendingMigrations: validPromotionEvidence().pendingMigrations, classification: "backfill", run: step => {
        calls.push(`execute:${step}`);
        const result = validStepResult(step);
        if (scenario === "changed ledger" && step === "pre-invariants") result.summary.ledgerSha256 = "0".repeat(64);
        if (scenario === "changed identity" && step === "identity") result.summary.databaseId = "wrong";
        if (scenario === "changed pending" && step === "reviewed-pending-range") result.summary.pendingMigrations = [];
        return result;
      } });
    };
    if (scenario === "success") {
      const evidence = orchestrate();
      expect(assertDeployEvidence({ signedEvidence: evidence, commit, database: production }).verdict).toBe("pass");
      expect(calls).toEqual(["prepare:identity", "prepare:recovery-bookmark", "prepare:recovery-export", "prepare:reviewed-pending-range", "prepare:pre-invariants", "prepare:source-schema", "upload", "durable-verified", "approval", "execute:identity", "execute:reviewed-pending-range", "execute:pre-invariants", "execute:source-schema", "execute:migration-apply", "execute:ledger-clean", "execute:schema-contract", "execute:post-invariants"]);
    } else {
      expect(orchestrate).toThrow();
      expect(calls).not.toContain("execute:migration-apply");
      if (["upload unavailable", "digest mismatch", "export mismatch", "request mismatch", "wrong attempt"].includes(scenario)) expect(calls).not.toContain("approval");
    }
  });

  it.each(["approved", "rejected", "stale-token", "token-only"])("executes the downloaded-artifact verification and approval CLIs locally: %s", state => {
    const cwd = mkdtempSync(path.join(tmpdir(), "durable-recovery-cli-"));
    try {
      const { bundle, preparation } = preparedHandshake();
      for (const [name, data] of Object.entries({ request: bundle.request, preparation, provenance: { changeAuthors: ["author"] } })) writeFileSync(path.join(cwd, `${name}.json`), JSON.stringify(data));
      writeFileSync(path.join(cwd, "export.enc"), bundle.encrypted);
      const invoke = (script, args, env = {}) => spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], { cwd, env: { ...process.env, ...context, ...env }, encoding: "utf8" });
      const verified = invoke("./verify-production-preparation.mjs", ["--request", "request.json", "--preparation", "preparation.json", "--encrypted-export", "export.enc", "--preparation-digest", bundle.expectedDigest, "--artifact-id", "123", "--output", "receipt.json"]);
      expect(verified.status, verified.stderr).toBe(0);
      const receipt = JSON.parse(readFileSync(path.join(cwd, "receipt.json"), "utf8"));
      for (const suffix of ["json", "junit.xml", "txt"]) expect(readFileSync(path.join(cwd, `tmp/recovery-verification/durable-recovery-verification.${suffix}`), "utf8")).toContain(receipt.preparationSha256);
      const privateDecision = "PRIVATE_APPROVAL_COMMENT_SENTINEL_128";
      const reviewState = ["stale-token", "token-only"].includes(state) ? "approved" : state;
      const comment = state === "token-only" ? approvalToken(receipt) : `Reviewed durable export and recovery ${privateDecision} ${state === "stale-token" ? "old request" : approvalToken(receipt)}`;
      writeFileSync(path.join(cwd, "reviews.json"), JSON.stringify([{ state: reviewState, user: { login: "independent-reviewer", type: "User" }, environments: [{ name: "production" }], comment }]));
      const approved = invoke("./capture-production-approval.mjs", ["--reviews", "reviews.json", "--provenance", "provenance.json", "--recovery-receipt", "receipt.json", "--output", "approval.json"], { REQUEST_CLASSIFICATION: "backfill" });
      expect(approved.status, approved.stderr).toBe(state === "approved" ? 0 : 1);
      if (state === "approved") {
        const approval = JSON.parse(readFileSync(path.join(cwd, "approval.json"), "utf8"));
        expect(JSON.stringify(approval)).not.toContain(privateDecision);
        expect(approval).toMatchObject({ riskDecision: { policy: "meaningful-written-risk-reason-v1", characterCount: expect.any(Number), wordCount: expect.any(Number) }, reviewReference: { repository: "serpcompany/serplists.com", runId: context.GITHUB_RUN_ID, runAttempt: context.GITHUB_RUN_ATTEMPT, commit, environment: "production" } });
        for (const field of ["decisionSha256", "recoveryTokenSha256"]) expect(approval[field]).toMatch(/^[0-9a-f]{64}$/);
        expect(approval.riskDecision.sha256).toMatch(/^[0-9a-f]{64}$/);
        const evidence = runProductionDataPhase({ commit, database: production, pendingMigrations: bundle.request.pendingMigrations, classification: "backfill", approval, preparation, receipt, run: validStepResult });
        expect(JSON.stringify(evidence)).not.toContain(privateDecision);
        expect(assertDeployEvidence({ signedEvidence: evidence, commit, database: production }).verdict).toBe("pass");
      } else {
        expect(existsSync(path.join(cwd, "approval.json"))).toBe(false);
        for (const suffix of ["json", "junit.xml", "txt", "md"]) expect(readFileSync(path.join(cwd, `tmp/data-reports/production/production-approval.${suffix}`), "utf8")).not.toContain(privateDecision);
        expect(approved.stdout + approved.stderr).not.toContain(privateDecision);
      }
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  it("blocks row/owner loss and nonzero invalid or orphan invariants", () => {
    const values = { users: 2, templates: 4, templates_active: 4, templates_deleted: 0, template_owners: 2, runs: 2, runs_active: 2, runs_deleted: 0, run_owners: 2, templates_invalid_json: 0, templates_invalid_version: 0, runs_invalid_json: 0, orphaned_templates: 0, orphaned_runs: 0, templates_invalid_content_version: 0, runs_invalid_template_version: 0, runs_invalid_revision: 0, runs_invalid_retired_json: 0 };
    const output = JSON.stringify([{ results: Object.entries(values).map(([invariant, total_rows]) => ({ invariant, total_rows })) }]);
    const pre = parseInvariantOutput(output);
    pre.ownershipDigest = "digest";
    const domain = { templates: [], runs: [], emptyRetiredItemsDigest: "empty", digest: "domain" };
    expect(compareProductionInvariants({ pre, post: pre, preDomain: domain, postDomain: domain }).verdict).toBe("pass");
    expect(compareProductionInvariants({ pre, post: { ...pre, templates: 3 }, preDomain: domain, postDomain: domain }).verdict).toBe("fail");
    expect(compareProductionInvariants({ pre, post: { ...pre, orphaned_templates: 1 }, preDomain: domain, postDomain: domain }).verdict).toBe("fail");
    const omitted = { ...pre };
    delete omitted.runs;
    expect(compareProductionInvariants({ pre, post: omitted, preDomain: domain, postDomain: domain }).verdict).toBe("fail");
    expect(compareProductionInvariants({ pre, post: pre }).failures).toContain("per-row domain snapshot omitted");
  });

  it("detects privacy-safe owner and deletion-state swaps without exposing identifiers", () => {
    const key = "protected-owner-digest-key-123456789";
    const before = [{ kind: "template", id: "t1", user_id: "u1", deleted_state: "active" }];
    expect(privacySafeOwnershipDigest({ rows: before, key })).not.toContain("u1");
    expect(privacySafeOwnershipDigest({ rows: before, key })).not.toBe(privacySafeOwnershipDigest({ rows: [{ ...before[0], user_id: "u2" }], key }));
    expect(privacySafeOwnershipDigest({ rows: before, key })).not.toBe(privacySafeOwnershipDigest({ rows: [{ ...before[0], deleted_state: "deleted" }], key }));
  });

  it("rejects forged or tampered deploy evidence", () => {
    const signed = createSignedEvidence({
      payload: { verdict: "pass", commit, database: production, migrationRange: { from: "0024", to: "0024" } },
    });
    signed.payload.commit = "f".repeat(40);
    expect(() => assertDeployEvidence({ signedEvidence: signed, commit, database: production })).toThrow(/digest/i);
  });

  it.each([
    ["data commit", (fixture) => { fixture.signedEvidence.payload.commit = "f".repeat(40); fixture.signedEvidence.digest = createSignedEvidence({ payload: fixture.signedEvidence.payload }).digest; }],
    ["data database", (fixture) => { fixture.signedEvidence.payload.database.databaseId = "22222222-2222-4222-8222-222222222222"; fixture.signedEvidence.digest = createSignedEvidence({ payload: fixture.signedEvidence.payload }).digest; }],
    ["data range", (fixture) => { fixture.signedEvidence.payload.migrationRange.to = "0025_other.sql"; fixture.signedEvidence.digest = createSignedEvidence({ payload: fixture.signedEvidence.payload }).digest; }],
    ["missing production step", (fixture) => { delete fixture.signedEvidence.payload.results["recovery-export"]; fixture.signedEvidence.digest = createSignedEvidence({ payload: fixture.signedEvidence.payload }).digest; }],
    ["failed production step", (fixture) => { fixture.signedEvidence.payload.results["pre-invariants"].verdict = "fail"; fixture.signedEvidence.digest = createSignedEvidence({ payload: fixture.signedEvidence.payload }).digest; }],
    ["empty production step output", (fixture) => { fixture.signedEvidence.payload.results["pre-invariants"].outputLength = 0; fixture.signedEvidence.payload.results["pre-invariants"].artifactByteLength = 0; fixture.signedEvidence.digest = createSignedEvidence({ payload: fixture.signedEvidence.payload }).digest; }],
    ["missing production artifact digest", (fixture) => { delete fixture.signedEvidence.payload.results["recovery-export"].artifactSha256; fixture.signedEvidence.digest = createSignedEvidence({ payload: fixture.signedEvidence.payload }).digest; }],
    ["empty recovery artifact", (fixture) => { fixture.signedEvidence.payload.results["recovery-export"].summary.encryptedBackupByteLength = 0; fixture.signedEvidence.digest = createSignedEvidence({ payload: fixture.signedEvidence.payload }).digest; }],
    ["mismatched pending summary", (fixture) => { fixture.signedEvidence.payload.results["reviewed-pending-range"].summary.pendingMigrations = []; fixture.signedEvidence.digest = createSignedEvidence({ payload: fixture.signedEvidence.payload }).digest; }],
    ["empty invariant summary", (fixture) => { fixture.signedEvidence.payload.results["pre-invariants"].summary.invariantCount = 0; fixture.signedEvidence.digest = createSignedEvidence({ payload: fixture.signedEvidence.payload }).digest; }],
    ["unclean ledger summary", (fixture) => { fixture.signedEvidence.payload.results["ledger-clean"].summary.pendingMigrations = ["hidden.sql"]; fixture.signedEvidence.digest = createSignedEvidence({ payload: fixture.signedEvidence.payload }).digest; }],
    ["empty schema summary", (fixture) => { fixture.signedEvidence.payload.results["schema-contract"].summary.schemaDigest = ""; fixture.signedEvidence.digest = createSignedEvidence({ payload: fixture.signedEvidence.payload }).digest; }],
    ["source-only schema proof", (fixture) => { fixture.signedEvidence.payload.results["schema-contract"] = fixture.signedEvidence.payload.results['source-schema']; fixture.signedEvidence.digest = createSignedEvidence({ payload: fixture.signedEvidence.payload }).digest; }],
    ["missing step identity", (fixture) => { fixture.signedEvidence.payload.results["migration-apply"].identityChecks = []; fixture.signedEvidence.digest = createSignedEvidence({ payload: fixture.signedEvidence.payload }).digest; }],
    ["missing independent approval", (fixture) => { fixture.signedEvidence.payload.approval = {}; fixture.signedEvidence.digest = createSignedEvidence({ payload: fixture.signedEvidence.payload }).digest; }],
    ["self approval in signed evidence", (fixture) => { fixture.signedEvidence.payload.approval.approver = "AUTHOR"; fixture.signedEvidence.digest = createSignedEvidence({ payload: fixture.signedEvidence.payload }).digest; }],
    ["approval classification", (fixture) => { fixture.signedEvidence.payload.approval.classification = "additive"; fixture.signedEvidence.digest = createSignedEvidence({ payload: fixture.signedEvidence.payload }).digest; }],
    ["approval author set", (fixture) => { fixture.signedEvidence.payload.approval.changeAuthors = ["different-author"]; fixture.signedEvidence.digest = createSignedEvidence({ payload: fixture.signedEvidence.payload }).digest; }],
    ["missing risky decision", (fixture) => { fixture.signedEvidence.payload.approval.riskDecision = { ...fixture.signedEvidence.payload.approval.riskDecision, wordCount: 0, sha256: null }; fixture.signedEvidence.digest = createSignedEvidence({ payload: fixture.signedEvidence.payload }).digest; }],
    ["smoke commit", (fixture) => { fixture.smoke.commit = "f".repeat(40); }],
    ["smoke environment", (fixture) => { fixture.smoke.target.environment = "staging"; }],
    ["smoke database name", (fixture) => { fixture.smoke.target.databaseName = "other"; }],
    ["smoke database id", (fixture) => { fixture.smoke.target.databaseId = "22222222-2222-4222-8222-222222222222"; }],
    ["smoke deployment URL", (fixture) => { fixture.smoke.deploymentUrl = "https://other.pages.dev"; }],
    ["smoke custom domain", (fixture) => { fixture.smoke.customDomain = "https://other.example"; }],
    ["missing canary check", (fixture) => { fixture.smoke.checks.pop(); }],
    ["duplicate canary check", (fixture) => { fixture.smoke.checks.push({ ...fixture.smoke.checks[0] }); }],
    ["extra canary check", (fixture) => { fixture.smoke.checks.push({ name: "invented", verdict: "pass" }); }],
    ["nonliteral canary verdict", (fixture) => { fixture.smoke.checks[0].verdict = true; }],
    ["failed canary check", (fixture) => { fixture.smoke.checks[0].verdict = "fail"; }],
    ["privacy-unsafe canary payload", (fixture) => { fixture.smoke.canaryMutation = { originalTitle: "private" }; }],
    ["contradictory smoke failures", (fixture) => { fixture.smoke.failures = ["hidden_failure"]; }],
  ])("final production release rejects mismatched %s", (_name, mutate) => {
    const request = validPromotionEvidence();
    const signed = validSignedProductionEvidence(request);
    const smoke = validProductionSmoke();
    const fixture = { request, signedEvidence: signed, smoke, deploymentUrl: smoke.deploymentUrl };
    mutate(fixture);
    expect(() => validateFinalProductionRelease(fixture)).toThrow();
  });

  it("final production release accepts only exact signed data and smoke evidence", () => {
    const request = validPromotionEvidence();
    const signedEvidence = validSignedProductionEvidence(request);
    const deploymentUrl = "https://release.pages.dev";
    const smoke = { ...validProductionSmoke(), deploymentUrl };
    expect(validateFinalProductionRelease({ request, signedEvidence, smoke, deploymentUrl })).toMatchObject({ commit, database: production, migrationRange: request.migrationRange });
  });
});
