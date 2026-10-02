import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  forgetGitRepositoryOverrides,
  GIT_REPOSITORY_OVERRIDES,
  withoutGitRepositoryOverrides,
} from '../../../scripts/lib/git-env';

const scratch = mkdtempSync(path.join(tmpdir(), 'git-env-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const git = (cwd: string, env: NodeJS.ProcessEnv, ...args: string[]) =>
  execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
    cwd,
    env,
    encoding: 'utf8',
  });

const commitCount = (repo: string) => Number(git(repo, withoutGitRepositoryOverrides(), 'rev-list', '--count', 'HEAD').trim());

function repositoryWithOneCommit(name: string) {
  const repo = path.join(scratch, name);
  git(scratch, withoutGitRepositoryOverrides(), 'init', '-q', name);
  writeFileSync(path.join(repo, 'first.txt'), 'first\n');
  git(repo, withoutGitRepositoryOverrides(), 'add', 'first.txt');
  git(repo, withoutGitRepositoryOverrides(), 'commit', '-q', '-m', 'first');
  return repo;
}

describe('git repository overrides', () => {
  it('drops the variables that point git at another repository, and keeps the rest', () => {
    const env = { ...process.env, PATH: '/bin', GIT_AUTHOR_DATE: '2026-10-01T00:00:00Z', GIT_DIR: '/x/.git', GIT_WORK_TREE: '/x', GIT_INDEX_FILE: '/x/.git/index' };

    const cleaned = withoutGitRepositoryOverrides(env);

    expect(GIT_REPOSITORY_OVERRIDES.filter((name) => name in cleaned)).toEqual([]);
    expect([cleaned['PATH'], cleaned['GIT_AUTHOR_DATE']]).toEqual(['/bin', '2026-10-01T00:00:00Z']);
  });

  it('keeps a fixture repository apart from the one a git hook names, which a plain GIT_DIR would commit into', () => {
    const hookRepository = repositoryWithOneCommit('hook-repository');
    const fixture = repositoryWithOneCommit('fixture');
    const insideAHook = { ...process.env, GIT_DIR: path.join(hookRepository, '.git') };
    writeFileSync(path.join(fixture, 'second.txt'), 'second\n');

    git(fixture, withoutGitRepositoryOverrides(insideAHook), 'add', 'second.txt');
    git(fixture, withoutGitRepositoryOverrides(insideAHook), 'commit', '-q', '-m', 'second');
    expect([commitCount(fixture), commitCount(hookRepository)]).toEqual([2, 1]);

    writeFileSync(path.join(fixture, 'third.txt'), 'third\n');
    git(fixture, insideAHook, 'add', 'third.txt');
    git(fixture, insideAHook, 'commit', '-q', '-m', 'third');
    expect([commitCount(fixture), commitCount(hookRepository)]).toEqual([2, 2]);
  });

  it('forgets them in place, as the unit test setup does before any test runs', () => {
    const env: NodeJS.ProcessEnv = { ...process.env, GIT_DIR: '/x/.git', GIT_COMMON_DIR: '/x/.git', HOME: '/home/test' };

    forgetGitRepositoryOverrides(env);

    expect(GIT_REPOSITORY_OVERRIDES.filter((name) => env[name] !== undefined)).toEqual([]);
    expect(env['HOME']).toBe('/home/test');
    expect(GIT_REPOSITORY_OVERRIDES.filter((name) => process.env[name] !== undefined)).toEqual([]);
  });
});
