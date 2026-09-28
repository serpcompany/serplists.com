import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { directoriesWithoutFiles, walkFiles } from '../../../scripts/lib/repo-files.mjs';

const repoRoot = process.cwd();
const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'repo-files-'));

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

function writeFixture(relativePath: string, content = '') {
  const absolutePath = path.join(fixtureRoot, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

const git = (...args: string[]) => execFileSync('git', args, { cwd: fixtureRoot, encoding: 'utf8' });

git('init', '-q');
writeFixture('.gitignore', 'ignored/\n*.log\n');
writeFixture('docs/plans/active/.gitkeep');
writeFixture('docs/plans/completed/done.md', '# Done\n');
writeFixture('docs/plans/completed/node_modules/skip.md', '# Skip\n');
git('add', '.gitignore', 'docs/plans/active/.gitkeep', 'docs/plans/completed/done.md');
mkdirSync(path.join(fixtureRoot, 'docs', 'plans', 'emptied'), { recursive: true });
writeFixture('docs/plans/logs-only/run.log', 'log\n');
writeFixture('docs/plans/new/draft.md', '# Draft\n');

describe('walkFiles', () => {
  it('returns no files for a directory that does not exist', () => {
    expect(walkFiles(fixtureRoot, 'docs/plans/missing', () => true)).toEqual([]);
  });

  it('lists matching files with repository-relative paths and skips node_modules', () => {
    expect(walkFiles(fixtureRoot, 'docs/plans/completed', (file: string) => file.endsWith('.md'))).toEqual([
      'docs/plans/completed/done.md',
    ]);
  });

  it('keeps working for the real active plans folder', () => {
    expect(() => walkFiles(repoRoot, 'docs/exec-plans/active', (file: string) => file.endsWith('.md'))).not.toThrow();
  });
});

describe('directoriesWithoutFiles', () => {
  it('flags directories that a fresh checkout would not have', () => {
    const dirs = [
      'docs/plans/active/',
      'docs/plans/completed',
      'docs/plans/emptied/',
      'docs/plans/logs-only/',
      'docs/plans/new/',
    ];
    expect([...directoriesWithoutFiles(fixtureRoot, dirs)].sort()).toEqual([
      'docs/plans/emptied/',
      'docs/plans/logs-only/',
    ]);
  });

  it('returns nothing when there is nothing to check', () => {
    expect([...directoriesWithoutFiles(fixtureRoot, [])]).toEqual([]);
  });
});
