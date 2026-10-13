import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { selectScanTargets } from '../../../scripts/secret-scan-lib';

const repoRoot = process.cwd();
const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'secret-scan-'));

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

function writeFixture(relativePath: string, content: string | Buffer): string {
  const absolutePath = path.join(fixtureRoot, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
  return absolutePath;
}

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

  it('drops missing files, directories, default-ignored folders and binary files', () => {
    const kept = writeFixture('select/a (b)/{x}.ts', 'x\n');
    writeFixture('select/node_modules/pkg/index.js', 'x\n');
    writeFixture('select/icon.png', Buffer.from([137, 80, 78, 71, 0, 0, 0, 13]));

    const targets = selectScanTargets(
      [kept, 'select/missing.ts', 'select', 'select/node_modules/pkg/index.js', '.git/config', 'select/icon.png'],
      { cwd: fixtureRoot },
    );

    expect(targets).toEqual([kept]);
  });
});
