import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { throwawayRepositoryEnvironment } from '../../support/throwawayGitRepository';

const directories: string[] = [];
const directory = (name: string) => {
  const created = mkdtempSync(path.join(tmpdir(), `${name}-`));
  directories.push(created);
  return created;
};

const configOf = (repository: string) =>
  execFileSync('git', ['config', '--file', path.join(repository, '.git', 'config'), '--list'], { encoding: 'utf8' });

const createRepositoryWithAnIdentity = (repository: string, env: NodeJS.ProcessEnv) => {
  execFileSync('git', ['init', '-q'], { cwd: repository, env });
  execFileSync('git', ['config', 'user.name', 'Throwaway Test'], { cwd: repository, env });
};

afterEach(() => {
  for (const created of directories.splice(0)) rmSync(created, { recursive: true, force: true });
});

describe('a throwaway git repository in a test', () => {
  it('is set up in its own directory even when the environment names the checkout, as a git hook running the tests does', () => {
    const checkout = directory('checkout');
    execFileSync('git', ['init', '-q'], { cwd: checkout, env: throwawayRepositoryEnvironment() });
    const checkoutGitDir = path.join(checkout, '.git');

    const inheritingTheHookEnvironment = { ...throwawayRepositoryEnvironment(), GIT_DIR: checkoutGitDir };
    createRepositoryWithAnIdentity(directory('leaky'), inheritingTheHookEnvironment);
    expect(configOf(checkout), 'an inherited GIT_DIR sends git init and git config to the checkout').toContain(
      'user.name=Throwaway Test',
    );

    const cleanCheckout = directory('checkout');
    execFileSync('git', ['init', '-q'], { cwd: cleanCheckout, env: throwawayRepositoryEnvironment() });
    const throwaway = directory('throwaway');
    const previousGitDir = process.env.GIT_DIR;
    process.env.GIT_DIR = path.join(cleanCheckout, '.git');
    try {
      createRepositoryWithAnIdentity(throwaway, throwawayRepositoryEnvironment());
    } finally {
      if (previousGitDir === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = previousGitDir;
    }

    expect(configOf(cleanCheckout)).not.toContain('user.name=');
    expect(configOf(cleanCheckout)).toContain('core.bare=false');
    expect(existsSync(path.join(throwaway, '.git'))).toBe(true);
    expect(configOf(throwaway)).toContain('user.name=Throwaway Test');
  });
});
