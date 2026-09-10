import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import yaml from 'js-yaml';

const root = fileURLToPath(new URL('../..', import.meta.url));
const workflow = yaml.load(readFileSync(path.join(root, '.github/workflows/cloudflare-pages-deploy.yml'), 'utf8'));
const steps = workflow.jobs.production_request.steps;
const gate = steps.find((step) => step.id === 'production_input_gate');
const installs = steps.filter((step) => /^pnpm install\b/.test(step.run ?? ''));
const commit = '0123456789abcdef0123456789abcdef01234567';
// Deliberately do not inherit tokens, NODE_PATH, NODE_OPTIONS, or provider credentials.
const environment = {
  PATH: `${path.dirname(process.execPath)}:${process.env.PATH}`,
  HOME: process.env.HOME,
  CI: 'true', COREPACK_ENABLE_AUTO_PIN: '0',
  GITHUB_SHA: commit, EXPECTED_COMMIT: commit,
  MIGRATION_FROM: 'none', MIGRATION_TO: 'none', MIGRATION_CLASSIFICATION: 'additive',
  CI_RUN_ID: '101', STAGING_RUN_ID: '102', REHEARSAL_RUN_ID: '103',
  CONFIRM_PRODUCTION_DATABASE_ID: 'b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1',
};
function run(cwd, command, args, extra = {}) {
  return spawnSync(command, args, { cwd, env: { ...environment, ...extra }, encoding: 'utf8', timeout: 120000 });
}
function cli(cwd, name, args = [], extra = {}) {
  return run(cwd, process.execPath, [`scripts/data/${name}.mjs`, ...args], extra);
}
function passes(result) {
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
}
function json(cwd, file, value) {
  writeFileSync(path.join(cwd, file), JSON.stringify(value));
}

test('production-request keeps dependency setup behind the input gate and before every dependent command', () => {
  assert.equal(installs.length, 1);
  const install = installs[0];
  assert.equal(gate.run, 'node scripts/data/validate-workflow-inputs.mjs production');
  assert.equal(gate.if, undefined);
  assert.equal(gate['continue-on-error'], undefined);
  assert.equal(install.run, 'pnpm install --frozen-lockfile --ignore-scripts');
  assert.equal(install.if, "success() && steps.production_input_gate.outcome == 'success'");
  assert.equal(install['continue-on-error'], undefined);
  const installIndex = steps.indexOf(install);
  assert.ok(steps.indexOf(gate) < installIndex);
  const nodeCommands = steps.flatMap((step, index) => [...(step.run ?? '').matchAll(/node (scripts\/data\/[\w-]+\.mjs)/g)].map((match) => ({ file: match[1], index, step })));
  assert.deepEqual([...new Set(nodeCommands.map(({ file }) => path.basename(file)))].sort(), [
    'capture-change-provenance.mjs', 'prepare-publication-evidence.mjs', 'production-request.mjs',
    'select-range-evidence.mjs', 'validate-workflow-inputs.mjs', 'verify-github-run-evidence.mjs',
  ]);
  for (const { file, index, step } of nodeCommands) {
    if (['validate-workflow-inputs.mjs', 'prepare-publication-evidence.mjs'].includes(path.basename(file))) continue;
    assert.ok(index > installIndex, `${file} must follow dependency installation`);
    assert.equal(step.if, undefined, `${file} must retain default success gating`);
  }
  assert.deepEqual(steps.slice(0, steps.indexOf(gate)).map((step) => step.uses), [
    'actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09',
    'pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1',
    'actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444',
  ]);
  const pnpmSetup = steps.find((step) => step.uses?.startsWith('pnpm/action-setup@'));
  assert.ok(pnpmSetup.with?.run_install === undefined || pnpmSetup.with.run_install === false);
  assert.equal(workflow.jobs.production_request.environment, undefined);
  assert.doesNotMatch(JSON.stringify(workflow.jobs.production_request), /secrets\.|PRODUCTION_[A-Z_]*TOKEN/);
  for (const step of steps.filter((entry) => entry.uses)) assert.match(step.uses, /@[a-f0-9]{40}$/);
});

test('a clean production-request runner validates before installing and loads its evidence CLIs', { timeout: 180_000 }, () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'owner149-production-request-'));
  const prefetchFixture = mkdtempSync(path.join(tmpdir(), 'owner149-pnpm-prefetch-'));
  try {
    const tracked = run(root, 'git', ['ls-files', '-z', '--', 'scripts', 'src', 'db', 'package.json', 'pnpm-lock.yaml', 'wrangler.toml']);
    passes(tracked);
    for (const entry of tracked.stdout.split('\0').filter(Boolean)) {
      mkdirSync(path.dirname(path.join(fixture, entry)), { recursive: true });
      cpSync(path.join(root, entry), path.join(fixture, entry));
    }
    assert.equal(existsSync(path.join(fixture, 'node_modules')), false);
    const lockfile = readFileSync(path.join(fixture, 'pnpm-lock.yaml'), 'utf8');
    // Only replace lifecycle hooks in the disposable manifest; dependency specs
    // and the real repository lockfile remain exact. A hook would leave evidence.
    const manifest = JSON.parse(readFileSync(path.join(fixture, 'package.json')));
    for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) {
      manifest.scripts[hook] = `node -e "require('node:fs').writeFileSync('lifecycle-ran', '${hook}')"`;
    }
    json(fixture, 'package.json', manifest);
    cpSync(path.join(fixture, 'package.json'), path.join(prefetchFixture, 'package.json'));
    cpSync(path.join(fixture, 'pnpm-lock.yaml'), path.join(prefetchFixture, 'pnpm-lock.yaml'));
    const storePath = path.join(prefetchFixture, '.pnpm-store');
    const prefetchHome = path.join(prefetchFixture, 'home');
    const prefetchConfig = path.join(prefetchFixture, 'empty.npmrc');
    mkdirSync(prefetchHome);
    writeFileSync(prefetchConfig, '');
    // setup-node's restored cache can support the root install without keeping
    // every registry tarball needed by a second isolated --offline install.
    // Prefetch the exact frozen lockfile first; the fixture proof itself stays
    // offline and cannot resolve or download anything from the network.
    passes(run(prefetchFixture, 'pnpm', ['fetch', '--frozen-lockfile', '--ignore-scripts', '--store-dir', storePath], {
      HOME: prefetchHome,
      XDG_CONFIG_HOME: path.join(prefetchHome, '.config'),
      NPM_CONFIG_USERCONFIG: prefetchConfig,
      npm_config_userconfig: prefetchConfig,
    }));
    const bootstrap = [gate.run, ...installs.map((step) => `${step.run} --offline --store-dir ${JSON.stringify(storePath)}`)].join('\n');
    const shell = (source, extra = {}) => run(fixture, 'bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', source], extra);
    passes(shell(gate.run));
    const mismatch = shell(bootstrap, { GITHUB_SHA: 'f'.repeat(40) });
    assert.equal(mismatch.status, 1);
    assert.match(mismatch.stderr, /Workflow commit mismatch/);
    assert.equal(existsSync(path.join(fixture, 'node_modules')), false);
    assert.equal(existsSync(path.join(fixture, 'tmp/production-request.json')), false);
    const invalidInput = shell(bootstrap, { CI_RUN_ID: 'invalid; exit 0' });
    assert.equal(invalidInput.status, 1);
    assert.match(invalidInput.stderr, /Invalid workflow input CI_RUN_ID/);
    assert.equal(existsSync(path.join(fixture, 'node_modules')), false);

    // Failure reporting and publication still work when validation/install failed.
    const earlyFailure = steps.find((step) => step.name === 'Finalize production-request input failure');
    assert.equal(earlyFailure.if, "always() && steps.production_input_gate.outcome != 'success'");
    passes(shell(earlyFailure.run, {
      REPORT_COMMIT: commit, REPORT_ENVIRONMENT: 'production', REPORT_DATABASE_NAME: 'serp-checklists-db',
      REPORT_DATABASE_ID: environment.CONFIRM_PRODUCTION_DATABASE_ID, REPORT_MIGRATION_FROM: 'none', REPORT_MIGRATION_TO: 'none',
    }));
    assert.equal(JSON.parse(readFileSync(path.join(fixture, 'tmp/data-reports/production-request/early-failure.json'))).verdict, 'fail');
    const publication = steps.find((step) => step.run === 'node scripts/data/prepare-publication-evidence.mjs');
    assert.equal(publication.if, 'always()');
    passes(shell(publication.run, { GITHUB_RUN_ID: '101', GITHUB_RUN_ATTEMPT: '1', PUBLICATION_ENVIRONMENT: 'production', PUBLICATION_DATABASE_ID: environment.CONFIRM_PRODUCTION_DATABASE_ID }));
    assert.equal(JSON.parse(readFileSync(path.join(fixture, 'tmp/publication-evidence/publication.json'))).commit, commit);
    mkdirSync(path.join(fixture, 'range-evidence'));
    json(fixture, 'range-evidence/data-regression-suite.json', { migrationRange: { from: null, to: null } });
    passes(cli(fixture, 'select-range-evidence', ['range-evidence', 'none', 'none']));
    assert.equal(existsSync(path.join(fixture, 'node_modules')), false);

    for (const name of ['verify-github-run-evidence', 'capture-change-provenance', 'production-request']) {
      const missingDependency = cli(fixture, name);
      assert.equal(missingDependency.status, 1);
      assert.match(missingDependency.stderr, /ERR_MODULE_NOT_FOUND.*|Cannot find package 'zod'/);
      assert.equal(existsSync(path.join(fixture, 'tmp/production-request.json')), false);
    }

    // Execute the workflow's actual dependency setup, if any. Offline is only a
    // local transport restriction; frozen resolution and script policy are unchanged.
    passes(shell(bootstrap));
    assert.equal(existsSync(path.join(fixture, 'node_modules/zod/package.json')), true);
    assert.equal(existsSync(path.join(fixture, 'lifecycle-ran')), false);
    const metadata = {
      id: 101, repository: { full_name: 'serpcompany/serplists.com' }, head_sha: commit,
      conclusion: 'success', name: 'CI', event: 'push', head_branch: 'main', path: '.github/workflows/ci.yml',
    };
    json(fixture, 'run.json', metadata);
    const args = ['--metadata', 'run.json', '--commit', commit, '--workflow', 'CI', '--event', 'push', '--branch', 'main', '--path', '.github/workflows/ci.yml'];
    passes(cli(fixture, 'verify-github-run-evidence', args));
    for (const change of [
      { repository: { full_name: 'other/repository' } }, { head_sha: 'f'.repeat(40) },
      { event: 'pull_request' }, { name: 'Untrusted workflow' }, { path: '.github/workflows/other.yml' },
      { head_branch: 'staging' }, { conclusion: 'failure' }, { id: '101' },
    ]) {
      json(fixture, 'run.json', { ...metadata, ...change });
      const rejected = cli(fixture, 'verify-github-run-evidence', args);
      assert.equal(rejected.status, 1, JSON.stringify(change));
      assert.match(rejected.stderr, /production-configuration CANARY_STAGE_FAILED/);
    }
    for (const evidence of [
      { name: 'Protected data promotion and Pages deploy', event: 'push', branch: 'staging', file: '.github/workflows/cloudflare-pages-deploy.yml', bindCommit: false },
      { name: 'Data migration rehearsal', event: 'workflow_dispatch', branch: 'main', file: '.github/workflows/data-migration-rehearsal.yml', bindCommit: true },
    ]) {
      json(fixture, 'run.json', { ...metadata, name: evidence.name, event: evidence.event, head_branch: evidence.branch, path: evidence.file });
      passes(cli(fixture, 'verify-github-run-evidence', ['--metadata', 'run.json', '--workflow', evidence.name, '--event', evidence.event, '--branch', evidence.branch, '--path', evidence.file, ...(evidence.bindCommit ? ['--commit', commit] : [])]));
    }

    const head = 'a'.repeat(40);
    const authors = { nodes: [{ user: { login: 'fixture-author' } }], pageInfo: { hasNextPage: false } };
    json(fixture, 'pulls.json', [{ number: 149, merged_at: '2026-09-05T00:00:00Z', base: { ref: 'main' }, merge_commit_sha: commit, head: { sha: head }, user: { login: 'fixture-author' } }]);
    json(fixture, 'commits.json', [[{ sha: head, author: { login: 'fixture-author' }, committer: { login: 'fixture-author' } }]]);
    json(fixture, 'commit-authors.json', [{ data: { repository: { pullRequest: { commits: { nodes: [{ commit: { oid: head, authors } }] } } } } }]);
    json(fixture, 'merge-commit.json', { sha: commit, commit: { verification: { verified: true } }, author: { login: 'fixture-author' }, committer: { login: 'web-flow' } });
    json(fixture, 'merge-authors.json', { data: { repository: { object: { oid: commit, authors } } } });
    passes(cli(fixture, 'capture-change-provenance', ['--pulls', 'pulls.json', '--commits', 'commits.json', '--commit-authors', 'commit-authors.json', '--merge-commit', 'merge-commit.json', '--merge-authors', 'merge-authors.json', '--commit', commit, '--output', 'provenance.json']));
    assert.equal(JSON.parse(readFileSync(path.join(fixture, 'provenance.json'))).mergeCommit, commit);

    const absentEvidence = cli(fixture, 'production-request', [
      '--commit', commit, '--classification', 'additive', '--migration-from', 'none', '--migration-to', 'none',
      '--database-name', 'serp-checklists-db', '--database-id', environment.CONFIRM_PRODUCTION_DATABASE_ID,
      '--ci-report', 'absent-ci-report.json', '--output', 'tmp/production-request.json',
    ]);
    assert.equal(absentEvidence.status, 1);
    assert.match(absentEvidence.stderr, /production-configuration CANARY_STAGE_FAILED/);
    assert.doesNotMatch(absentEvidence.stderr, /absent-ci-report\.json|ENOENT/);
    assert.doesNotMatch(absentEvidence.stderr, /ERR_MODULE_NOT_FOUND/);
    assert.equal(existsSync(path.join(fixture, 'tmp/production-request.json')), false);
    const failureReport = JSON.parse(readFileSync(path.join(fixture, 'tmp/data-reports/production-request/production-request.json')));
    assert.equal(failureReport.verdict, 'fail');
    assert.equal(failureReport.commit, commit);
    assert.equal(failureReport.failedStage, 'production-request-validation');
    assert.equal(readFileSync(path.join(fixture, 'pnpm-lock.yaml'), 'utf8'), lockfile);
    manifest.dependencies.zod = '0.0.0';
    json(fixture, 'package.json', manifest);
    const staleLock = shell(bootstrap);
    assert.notEqual(staleLock.status, 0);
    assert.match(staleLock.stdout + staleLock.stderr, /ERR_PNPM_OUTDATED_LOCKFILE/);
    assert.equal(existsSync(path.join(fixture, 'lifecycle-ran')), false);
    assert.equal(readFileSync(path.join(fixture, 'pnpm-lock.yaml'), 'utf8'), lockfile);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
    rmSync(prefetchFixture, { recursive: true, force: true });
  }
});
