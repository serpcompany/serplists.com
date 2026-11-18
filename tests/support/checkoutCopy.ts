import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, copyFile, lstat, mkdir, mkdtemp, realpath, rm, rmdir, symlink, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { withoutGitRepositoryOverrides } from '../../scripts/lib/git-env';
import { REPO_ROOT } from '../../scripts/lib/run-tool';
import { CHILD_COVERAGE_VARIABLE, checkoutCopiesListOf } from './childProcessCoverage';
import { throwawayRepositoryEnvironment } from './throwawayGitRepository';

export type CheckoutCopy = { root: string; remove: () => Promise<void> };

const ranToTheEnd = promisify(execFile);

const FILES_COPIED_AT_ONCE = 64;

async function filesOfTheCheckout(): Promise<string[]> {
  const { stdout } = await ranToTheEnd('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: withoutGitRepositoryOverrides(),
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout.split('\0').filter((file) => file.length > 0 && existsSync(path.join(REPO_ROOT, file)));
}

const git = (root: string, args: string[]) => ranToTheEnd('git', args, { cwd: root, env: throwawayRepositoryEnvironment() });

async function inBatches<T>(items: readonly T[], each: (item: T) => Promise<unknown>): Promise<void> {
  for (let start = 0; start < items.length; start += FILES_COPIED_AT_ONCE) {
    await Promise.all(items.slice(start, start + FILES_COPIED_AT_ONCE).map(each));
  }
}

export async function unlinkWithoutFollowing(link: string): Promise<void> {
  try {
    await unlink(link);
  } catch {
    await rmdir(link);
  }
}

export const isALinkOrJunction = async (entry: string): Promise<boolean> =>
  (await lstat(entry)).isSymbolicLink() || (await realpath(entry)) !== entry;

async function removeTheCopy(root: string): Promise<void> {
  const dependencies = path.join(root, 'node_modules');
  if (existsSync(dependencies) && (await isALinkOrJunction(dependencies))) await unlinkWithoutFollowing(dependencies);
  if (existsSync(dependencies)) throw new Error(`The copy at ${root} still links node_modules; nothing was removed`);
  await rm(root, { recursive: true, force: true, maxRetries: 3 });
}

export async function aCopyOfTheCheckout({ asGitRepository = false }: { asGitRepository?: boolean } = {}): Promise<CheckoutCopy> {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'serplists-checkout-')));
  const files = await filesOfTheCheckout();
  await inBatches([...new Set(files.map((file) => path.dirname(path.join(root, file))))], (folder) => mkdir(folder, { recursive: true }));
  await inBatches(files, (file) => copyFile(path.join(REPO_ROOT, file), path.join(root, file)));
  await symlink(path.join(REPO_ROOT, 'node_modules'), path.join(root, 'node_modules'), 'junction');
  if (asGitRepository) {
    await git(root, ['init', '-q', '-b', 'staging']);
    await git(root, ['add', '-A']);
    await git(root, ['-c', 'user.name=Copy', '-c', 'user.email=copy@example.test', 'commit', '-q', '-m', 'copy']);
  }
  const rawCoverage = process.env[CHILD_COVERAGE_VARIABLE];
  if (rawCoverage) await appendFile(checkoutCopiesListOf(rawCoverage), `${root}\n`);
  return { root, remove: () => removeTheCopy(root) };
}
