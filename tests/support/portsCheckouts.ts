import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, expect } from 'vitest';
import { z } from 'zod';

import { REPO_ROOT } from '../../scripts/lib/run-tool';
import { throwawayRepositoryEnvironment } from './throwawayGitRepository';

export const PORTS_SCRIPT = path.join(REPO_ROOT, 'tools', 'checks', 'ports.mjs');

export const portsSchema = z.object({ dev: z.number(), e2e: z.number(), preview: z.number() }).strict();

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

export function scratch(): string {
  const folder = realpathSync(mkdtempSync(path.join(tmpdir(), 'ports-')));
  folders.push(folder);
  return folder;
}

export const portsEnvironment = (changes: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  ...throwawayRepositoryEnvironment(),
  PORT: undefined,
  ...changes,
});

const git = (folder: string, ...command: string[]) =>
  spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...command], {
    cwd: folder,
    encoding: 'utf8',
    env: portsEnvironment(),
  });

export function repository(): string {
  const folder = scratch();
  git(folder, 'init', '--quiet');
  git(folder, 'commit', '--quiet', '--allow-empty', '--message', 'Start');
  return folder;
}

export function worktree(main: string, name: string): string {
  const folder = path.join(main, '.claude', 'worktrees', name);
  expect(git(main, 'worktree', 'add', '--quiet', '--detach', folder).status).toBe(0);
  return folder;
}

export function subfolder(checkout: string): string {
  const folder = path.join(checkout, 'src', 'app');
  mkdirSync(folder, { recursive: true });
  return folder;
}

export function aPreloadedProgram(folder: string, lines: readonly string[]): string {
  const file = path.join(folder, 'stand-in.mjs');
  writeFileSync(file, [...lines, 'syncBuiltinESMExports();', ''].join('\n'));
  return pathToFileURL(file).href;
}

export const portsRun = (folder: string, command: string[], changes: Record<string, string> = {}) =>
  spawnSync(process.execPath, [PORTS_SCRIPT, ...command], { cwd: folder, encoding: 'utf8', env: portsEnvironment(changes) });

export const portsOf = (folder: string, changes: Record<string, string> = {}) =>
  portsSchema.parse(JSON.parse(portsRun(folder, ['--json'], changes).stdout));

export const claimsFolder = (main: string) => path.join(main, '.git', 'serplists-ports');

export const claims = (main: string) => readdirSync(claimsFolder(main)).sort();

export const lockOf = (main: string) => path.join(claimsFolder(main), 'lock');
