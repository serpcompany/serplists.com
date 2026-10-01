import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { afterAll, describe, expect, it } from 'vitest';
import { valueAt } from '../../support/elements';

import { selectScanTargets } from '../../../scripts/secret-scan-lib.mjs';

const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, 'scripts', 'secret-scan.mjs');
const fakeGithubTokenAssembledAtRuntime = ['gh', 'p_', 'wWPw5k4aXcaT4fNP0UcnZwJUVFk6LO0pINUx'].join('');

const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'secret-scan-'));

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

function writeFixture(relativePath: string, content: string): string {
  const absolutePath = path.join(fixtureRoot, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
  return absolutePath;
}

function runScan(paths: string[]) {
  const result = spawnSync(process.execPath, [scriptPath, ...paths], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

const NODE_PROCESS_START_ON_A_BUSY_MACHINE_MS = 30_000;

describe('secret scan', { timeout: NODE_PROCESS_START_ON_A_BUSY_MACHINE_MS }, () => {
  it('reports a secret in a Pages Functions catch-all route file', () => {
    const route = writeFixture('leaky/functions/api/[[route]].ts', `export const key = "${fakeGithubTokenAssembledAtRuntime}";\n`);

    const { status, output } = runScan([route]);

    expect(output).not.toContain('Not found target files');
    expect(status).toBe(1);
    expect(output).toContain('[[route]].ts');
  });

  it('reports secrets in every bracketed route file passed together', () => {
    const route = writeFixture('both/functions/api/[[route]].ts', `const a = "${fakeGithubTokenAssembledAtRuntime}";\n`);
    const sitemap = writeFixture('both/functions/sitemaps/pages/[page].xml.ts', `const b = "${fakeGithubTokenAssembledAtRuntime}";\n`);
    const plain = writeFixture('both/functions/api/db.ts', 'export const ok = true;\n');

    const { status, output } = runScan([plain, route, sitemap]);

    expect(status).toBe(1);
    expect(output).toContain('[[route]].ts');
    expect(output).toContain('[page].xml.ts');
  });

  it('passes a clean route file staged on its own', () => {
    const route = writeFixture('clean/functions/api/[[route]].ts', 'export const onRequest = () => null;\n');

    const { status, output } = runScan([route]);

    expect(output).not.toContain('Not found target files');
    expect(status).toBe(0);
  });

  it('passes when the only requested path no longer exists', () => {
    const { status, output } = runScan([path.join(fixtureRoot, 'deleted', 'gone.ts')]);

    expect(output).not.toContain('Not found target files');
    expect(status).toBe(0);
  });
});

describe('selectScanTargets', () => {
  it('keeps every tracked file, including names with glob syntax', () => {
    const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
      .stdout.split('\0')
      .filter(Boolean);
    const bracketed = tracked.filter((file) => /[[\](){}*?!+@]/.test(file));

    expect(bracketed).toContain('functions/api/[[route]].ts');

    const targets = selectScanTargets(bracketed, { cwd: repoRoot });

    expect(targets).toEqual(bracketed.map((file) => path.resolve(repoRoot, file)));
  });

  it('drops missing files, directories and default-ignored folders', () => {
    const kept = writeFixture('select/a (b)/{x}.ts', 'x\n');
    writeFixture('select/node_modules/pkg/index.js', 'x\n');

    const targets = selectScanTargets(
      [kept, 'select/missing.ts', 'select', 'select/node_modules/pkg/index.js', '.git/config'],
      { cwd: fixtureRoot },
    );

    expect(targets).toEqual([kept]);
  });
});

describe('pre-commit secret scan', () => {
  it('runs the repository scan script on staged files instead of bare secretlint', () => {
    const config = yaml.load(readFileSync(path.join(repoRoot, 'lefthook.yml'), 'utf8')) as {
      'pre-commit': { commands: Record<string, { run: string }> };
    };

    expect(valueAt(config['pre-commit'].commands, 'secret-scan').run).toBe('node scripts/secret-scan.mjs {staged_files}');
  });
});
