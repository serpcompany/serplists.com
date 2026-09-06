import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('../..', import.meta.url).pathname;
const sentinel = 'PRIVATE_PATH_SENTINEL_128';
const commit = 'a'.repeat(40);
const env = { PATH: process.env.PATH, GITHUB_SHA: commit, GITHUB_RUN_ID: '128' };
const run = (directory, name, args, extra = {}) => spawnSync(process.execPath, [path.join(root, 'scripts/data', `${name}.mjs`), ...args], { cwd: directory, env: { ...env, ...extra }, encoding: 'utf8' });
function blocked(result) {
  expect(result.status).toBe(1);
  expect(result.stdout + result.stderr).not.toContain(sentinel);
  expect(result.stdout + result.stderr).not.toContain('PRIVATE_');
  expect(result.stderr).not.toMatch(/\n\s+at |node:fs:\d/);
}
function fixture(test) {
  const directory = mkdtempSync(path.join(tmpdir(), 'privileged-evidence-128-'));
  try { test(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
}

describe('privileged evidence wrapper CLI privacy', () => {
  it.each([
    ['export-rehearsal-creation-env', ['--evidence']],
    ['verify-github-run-evidence', ['--metadata']],
    ['select-range-evidence', []],
  ])('%s contains missing private input paths', (name, flags) => fixture(directory => {
    blocked(run(directory, name, [...flags, path.join(directory, sentinel), ...(flags.length ? [] : ['none', 'none'])]));
  }));

  it.each(['export-rehearsal-creation-env', 'verify-github-run-evidence'])('%s contains raw JSON parse text', name => fixture(directory => {
    const file = path.join(directory, 'input.json'); writeFileSync(file, sentinel);
    blocked(run(directory, name, [name.startsWith('export') ? '--evidence' : '--metadata', file]));
  }));

  it('contains workflow argument interpolation on rejected GitHub evidence', () => fixture(directory => {
    const file = path.join(directory, 'run.json'); writeFileSync(file, '{}');
    blocked(run(directory, 'verify-github-run-evidence', ['--metadata', file, '--workflow', sentinel]));
  }));

  it('contains creation environment publication failures and retains exact run binding', () => fixture(directory => {
    const file = path.join(directory, 'creation.json');
    const databaseId = '11111111-1111-4111-8111-111111111111';
    const evidence = { verdict: 'pass', commit, runId: '128', target: { environment: 'rehearsal', databaseId } };
    writeFileSync(file, JSON.stringify(evidence));
    const args = ['--evidence', file, '--variable', 'RECOVERY_DATABASE_ID'];
    blocked(run(directory, 'export-rehearsal-creation-env', args, { GITHUB_ENV: path.join(directory, sentinel, 'absent') }));
    const output = path.join(directory, 'env');
    expect(run(directory, 'export-rehearsal-creation-env', args, { GITHUB_ENV: output }).status).toBe(0);
    expect(readFileSync(output, 'utf8')).toBe(`RECOVERY_DATABASE_ID=${databaseId}\n`);
    writeFileSync(file, JSON.stringify({ ...evidence, runId: '129' }));
    blocked(run(directory, 'export-rehearsal-creation-env', args, { GITHUB_ENV: output }));
    expect(readFileSync(output, 'utf8')).toBe(`RECOVERY_DATABASE_ID=${databaseId}\n`);
  }));

  it('retains GitHub workflow, repository, commit, and event bindings', () => fixture(directory => {
    const file = path.join(directory, 'run.json');
    const evidence = { id: 128, repository: { full_name: 'serpcompany/serplists.com' }, head_sha: commit, conclusion: 'success', name: 'CI', event: 'push', head_branch: 'main', path: '.github/workflows/ci.yml' };
    const args = ['--metadata', file, '--commit', commit, '--workflow', 'CI', '--event', 'push', '--branch', 'main', '--path', evidence.path];
    writeFileSync(file, JSON.stringify(evidence));
    expect(run(directory, 'verify-github-run-evidence', args).status).toBe(0);
    for (const change of [{ head_sha: 'b'.repeat(40) }, { repository: { full_name: sentinel } }, { name: sentinel }, { event: sentinel }, { head_branch: sentinel }, { path: sentinel }, { conclusion: 'failure' }]) {
      writeFileSync(file, JSON.stringify({ ...evidence, ...change }));
      blocked(run(directory, 'verify-github-run-evidence', args));
    }
  }));

  it('retains the range selector machine output and rejects malformed or duplicate matches', () => fixture(directory => {
    const file = path.join(directory, 'data-regression-suite.json');
    writeFileSync(file, JSON.stringify({ migrationRange: { from: null, to: null } }));
    const args = [directory, 'none', 'none'];
    const result = run(directory, 'select-range-evidence', args);
    expect(result.status).toBe(0); expect(result.stdout.trim()).toBe(file);
    writeFileSync(file, sentinel); blocked(run(directory, 'select-range-evidence', args));
    writeFileSync(file, JSON.stringify({ migrationRange: { from: null, to: null } }));
    mkdirSync(path.join(directory, 'duplicate'));
    writeFileSync(path.join(directory, 'duplicate', path.basename(file)), readFileSync(file));
    blocked(run(directory, 'select-range-evidence', args));
  }));

  it('staging finalizer contains report publication paths', () => fixture(directory => {
    const destination = path.join(directory, sentinel); writeFileSync(destination, 'blocking-file');
    blocked(run(directory, 'finalize-staging-promotion', ['--range', 'missing.json', '--output', path.join(destination, 'staging-promotion.json')]));
  }));

  it('staging finalizer omits an unchecked private tree from every failure format', () => fixture(directory => {
    const output = path.join(directory, 'staging-promotion.json');
    blocked(run(directory, 'finalize-staging-promotion', ['--range', 'missing.json', '--tree', sentinel, '--output', output]));
    for (const ext of ['json', 'md', 'txt', 'junit.xml']) {
      const file = output.replace(/\.json$/, `.${ext}`);
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file, 'utf8')).not.toContain(sentinel);
    }
  }));
});
