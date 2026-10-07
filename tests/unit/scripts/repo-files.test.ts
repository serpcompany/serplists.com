import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { directoriesAFreshCheckoutLacks, walkFiles } from '../../../scripts/lib/repo-files';
import { throwawayRepositoryEnvironment } from '../../support/throwawayGitRepository';

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

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: fixtureRoot, encoding: 'utf8', env: throwawayRepositoryEnvironment() });

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
  it('returns no files for a folder that does not exist, as git drops one once its last file moves out', () => {
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

describe('directoriesAFreshCheckoutLacks', () => {
  it('flags folders holding no file git tracks or would track, so a fresh checkout would not have them', () => {
    const dirs = [
      'docs/plans/active/',
      'docs/plans/completed',
      'docs/plans/emptied/',
      'docs/plans/logs-only/',
      'docs/plans/new/',
    ];
    expect([...directoriesAFreshCheckoutLacks(fixtureRoot, dirs)].sort()).toEqual([
      'docs/plans/emptied/',
      'docs/plans/logs-only/',
    ]);
  });

  it('returns nothing when there is nothing to check', () => {
    expect([...directoriesAFreshCheckoutLacks(fixtureRoot, [])]).toEqual([]);
  });

  it('flags nothing outside a git checkout, where it cannot tell', () => {
    const notAGitCheckout = mkdtempSync(path.join(tmpdir(), 'repo-files-no-git-'));
    try {
      mkdirSync(path.join(notAGitCheckout, 'emptied'));
      expect([...directoriesAFreshCheckoutLacks(notAGitCheckout, ['emptied/'])]).toEqual([]);
    } finally {
      rmSync(notAGitCheckout, { recursive: true, force: true });
    }
  });
});
