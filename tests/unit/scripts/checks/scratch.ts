import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';

import { throwawayRepositoryEnvironment } from '../../../support/throwawayGitRepository';

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

export function scratchFolder(name: string): string {
  const folder = realpathSync(mkdtempSync(path.join(tmpdir(), `serplists-${name}-`)));
  folders.push(folder);
  return folder;
}

export function writeFiles(folder: string, files: Readonly<Record<string, string | Buffer>>): void {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(folder, file)), { recursive: true });
    writeFileSync(path.join(folder, file), content);
  }
}

export const git = (folder: string, ...args: string[]) =>
  spawnSync('git', ['-c', 'user.name=Scratch', '-c', 'user.email=scratch@example.com', ...args], {
    cwd: folder,
    encoding: 'utf8',
    env: throwawayRepositoryEnvironment(),
  });

export function scratchRepository(name: string, files: Readonly<Record<string, string | Buffer>>): string {
  const folder = scratchFolder(name);
  git(folder, 'init', '--quiet');
  writeFiles(folder, files);
  return folder;
}
