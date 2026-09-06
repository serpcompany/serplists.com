import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { resolveRehearsalPlan } from './rehearsal-plan-lib.mjs';
import { completeRehearsalEvidence } from './fixtures/complete-rehearsal-evidence.mjs';

const root = new URL('../..', import.meta.url).pathname;
const sentinel = 'PRIVATE_PATH_SENTINEL_128';
const commit = 'a'.repeat(40);
it('production request contains actual read, parse, context and failure-publication leaks', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'production-request-privacy-'));
  try {
    const output = path.join(directory, 'request.json');
    const ci = path.join(directory, sentinel);
    const args = ['--commit', commit, '--database-name', 'serp-checklists-db', '--database-id', 'b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1', '--migration-from', 'none', '--migration-to', 'none', '--classification', 'additive', '--ci-report', ci, '--output', output];
    const reportDirectory = path.join(directory, 'tmp/data-reports/production-request');
    const run = (candidate = args) => spawnSync(process.execPath, [path.join(root, 'scripts/data/production-request.mjs'), ...candidate], { cwd: directory, env: { PATH: process.env.PATH }, encoding: 'utf8' });
    const check = result => {
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).not.toContain(sentinel);
      expect(result.stderr).not.toMatch(/\n\s+at |node:fs:\d/);
      expect(existsSync(output)).toBe(false);
      for (const ext of ['json', 'md', 'txt', 'junit.xml']) {
        const contents = readFileSync(path.join(reportDirectory, `production-request.${ext}`), 'utf8');
        expect(contents).not.toContain(sentinel);
        if (ext === 'json') expect(JSON.parse(contents)).toMatchObject({ verdict: 'fail', errorCode: 'CANARY_STAGE_FAILED' });
        if (ext === 'junit.xml') expect(contents).toContain('failures="1"');
      }
    };
    check(run());
    expect(JSON.parse(readFileSync(path.join(reportDirectory, 'production-request.json'), 'utf8'))).toMatchObject({ commit, target: { environment: 'production', binding: 'DB', databaseName: 'serp-checklists-db' }, migrationRange: { from: null, to: null }, failedStage: 'production-request-validation' });
    for (const flag of ['--commit', '--database-name', '--database-id', '--migration-from', '--migration-to', '--classification']) check(run(args.map((value, index) => args[index - 1] === flag ? sentinel : value)));
    check(run(args.map((value, index) => args[index - 1] === '--migration-to' ? '9999_private_path_sentinel_128.sql' : value)));
    expect(readFileSync(path.join(reportDirectory, 'production-request.json'), 'utf8')).not.toContain('9999_private_path_sentinel_128.sql');
    writeFileSync(ci, sentinel); check(run());
    writeFileSync(ci, '{}'); check(run());
    // A failed rerun must invalidate prior success evidence and summaries.
    writeFileSync(output, '{"verdict":"pass"}');
    mkdirSync(path.join(directory, 'reports'), { recursive: true });
    for (const ext of ['json', 'md', 'txt', 'junit.xml']) writeFileSync(path.join(directory, 'reports', `production-request.${ext}`), 'PASS');
    check(run());
    for (const ext of ['json', 'md', 'txt', 'junit.xml']) {
      const file = path.join(directory, 'reports', `production-request.${ext}`);
      if (existsSync(file)) expect(readFileSync(file, 'utf8')).not.toMatch(/\bPASS\b/);
    }
    rmSync(reportDirectory, { recursive: true });
    writeFileSync(reportDirectory, sentinel);
    const blocked = run();
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).not.toContain(sentinel);
    expect(blocked.stderr).not.toMatch(/\n\s+at |node:fs:\d/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it('production request preserves complete success evidence and contains partial publication failures', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'production-request-publication-'));
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const ledger = readdirSync(path.join(root, 'db/migrations')).filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
    const plan = resolveRehearsalPlan({ repoRoot: root, commit: head, migrationFrom: 'none', migrationTo: 'none' });
    const coverage = { verdict: 'pass', planId: plan.id, fixtureProfile: plan.fixtureProfile, declarationSha256: plan.declarationSha256, artifactSha256: plan.artifactSha256, affectedTables: plan.affectedTables, invariants: plan.invariants };
    const stagingCommit = 'c'.repeat(40), tree = 'd'.repeat(40);
    const ci = { verdict: 'pass', check: 'data-regression-suite', commit: head, workingTreeDirty: false, migrationRange: plan.migrationRange, coverage, teardown: { verdict: 'pass' } };
    const reports = {
      'ci-report': ci,
      'correction-report': { verdict: 'pass', commit: head, eventName: 'push', comparisonBase: head },
      'schema-report': { verdict: 'pass', commit: head, runtimeDiff: { verdict: 'pass' }, authorityDiff: { verdict: 'pass' }, snapshotDiff: { verdict: 'pass' }, migrationRange: { from: ledger[0], to: ledger.at(-1) } },
      'rehearsal-report': completeRehearsalEvidence({ commit: head, migrationRange: plan.migrationRange, ledger, coverage }),
      'staging-report': { verdict: 'pass', commit: stagingCommit, tree, target: { environment: 'staging', databaseId: 'fcaf4325-5be7-4ead-ab60-45932a04177b' }, migrationRange: plan.migrationRange, pendingMigrations: [], data: ci, schema: { verdict: 'pass', ledger: { verdict: 'pass' } }, invariants: { verdict: 'pass', migrationRange: plan.migrationRange, ledger: { verdict: 'pass', before: ledger, after: ledger } }, deploy: { verdict: 'pass' }, smoke: { verdict: 'pass', failures: [], controlledCanaryMutationApproved: true, canaryEvidenceDigest: 'a'.repeat(64), checks: ['template_canary_designated', 'template_write', 'template_write_readback', 'template_restore', 'run_canary_designated', 'run_write', 'run_write_readback', 'run_restore'].map(name => ({ name, verdict: 'pass' })) }, teardown: { verdict: 'pass' } },
      'ci-run-metadata': { id: 101, head_sha: head, conclusion: 'success', name: 'CI', event: 'push', head_branch: 'main', path: '.github/workflows/ci.yml', repository: { full_name: 'serpcompany/serplists.com' } },
      'staging-run-metadata': { id: 102, head_sha: stagingCommit, conclusion: 'success', name: 'Protected data promotion and Pages deploy', event: 'push', head_branch: 'staging', path: '.github/workflows/cloudflare-pages-deploy.yml', repository: { full_name: 'serpcompany/serplists.com' } },
      'merge-commit': { sha: head, commit: { tree: { sha: tree } }, parents: [{ sha: head }] },
      'change-provenance': { mergeCommit: head, pullRequestNumber: 128, pullRequestHeadCommit: stagingCommit, changeAuthors: ['author'] },
    };
    const output = path.join(directory, 'request.json');
    const args = ['--commit', head, '--database-name', 'serp-checklists-db', '--database-id', 'b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1', '--migration-from', 'none', '--migration-to', 'none', '--classification', 'additive', '--output', output];
    for (const [name, value] of Object.entries(reports)) {
      const file = path.join(directory, `${name}.json`); writeFileSync(file, JSON.stringify(value)); args.push(`--${name}`, file);
    }
    const run = (preload = []) => spawnSync(process.execPath, [...preload, path.join(root, 'scripts/data/production-request.mjs'), ...args], { cwd: directory, env: { PATH: process.env.PATH }, encoding: 'utf8' });
    const healthy = run(); expect(healthy.status, healthy.stderr).toBe(0);
    const evidence = JSON.parse(readFileSync(output, 'utf8'));
    expect(evidence.rehearsal).toEqual(reports['rehearsal-report']);
    expect(evidence).toMatchObject({ commit: head, migrationRange: { from: null, to: null }, pendingMigrations: [], ci: { coverage } });
    for (const ext of ['json', 'md', 'txt', 'junit.xml']) {
      const text = readFileSync(path.join(directory, 'reports', `production-request.${ext}`), 'utf8');
      expect(text).toContain(head); expect(text).not.toContain(sentinel);
      if (ext === 'junit.xml') expect(text).toContain('failures="0"');
    }
    for (const name of Object.keys(reports)) {
      const index = args.indexOf(`--${name}`) + 1;
      const file = args[index];
      for (const kind of ['missing', 'parse']) {
        if (kind === 'missing') args[index] = path.join(directory, sentinel);
        else writeFileSync(file, sentinel);
        const failed = run();
        expect(failed.status).toBe(1);
        expect(failed.stdout + failed.stderr).not.toContain('PRIVATE_');
        expect(existsSync(output)).toBe(false);
        for (const ext of ['json', 'md', 'txt', 'junit.xml']) {
          const text = readFileSync(path.join(directory, 'tmp/data-reports/production-request', `production-request.${ext}`), 'utf8');
          expect(text).not.toContain('PRIVATE_'); expect(text).not.toMatch(/\bPASS\b/);
        }
        args[index] = file;
        writeFileSync(file, JSON.stringify(reports[name]));
      }
    }
    expect(run().status).toBe(0);
    // Fault only filesystem publication, after real validation and partial writes.
    const preload = path.join(directory, 'publication-fault.mjs');
    for (const suffix of ['production-request.md', 'request.json']) {
      writeFileSync(preload, `import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
const write = fs.writeFileSync; let failed = false;
fs.writeFileSync = function(file, ...rest) { if (!failed && String(file).endsWith(${JSON.stringify(suffix)})) { failed = true; throw new Error('${sentinel}'); } return write.call(this, file, ...rest); }; syncBuiltinESMExports();`);
      const result = run(['--import', preload]);
      expect(result.status).toBe(1); expect(result.stderr).not.toContain(sentinel); expect(result.stderr).not.toMatch(/\n\s+at /);
      expect(existsSync(output)).toBe(false);
      for (const base of ['reports', 'tmp/data-reports/production-request']) for (const ext of ['json', 'md', 'txt', 'junit.xml']) {
        const text = readFileSync(path.join(directory, base, `production-request.${ext}`), 'utf8');
        expect(text).not.toContain(sentinel); expect(text).not.toMatch(/\bPASS\b/);
        if (ext === 'json') expect(JSON.parse(text)).toMatchObject({ verdict: 'fail', failedStage: 'data-reporting', errorCode: 'CANARY_STAGE_FAILED' });
        if (ext === 'junit.xml') expect(text).toContain('failures="1"');
      }
      expect(run().status).toBe(0);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
