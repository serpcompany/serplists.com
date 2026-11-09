import { execFileSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmdirSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { withoutGitRepositoryOverrides } from '../../scripts/lib/git-env';
import { REPO_ROOT } from '../../scripts/lib/run-tool';
import { CHILD_COVERAGE_VARIABLE, checkoutCopiesListOf } from './childProcessCoverage';
import { throwawayRepositoryEnvironment } from './throwawayGitRepository';

export type CheckoutCopy = { root: string; remove: () => void };

const filesOfTheCheckout = (): string[] =>
  execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: withoutGitRepositoryOverrides(),
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter((file) => file.length > 0);

const git = (root: string, args: string[]) =>
  execFileSync('git', args, { cwd: root, env: throwawayRepositoryEnvironment(), stdio: 'ignore' });

function unlinkTheDependencies(link: string): void {
  if (!lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) return;
  try {
    unlinkSync(link);
  } catch {
    rmdirSync(link);
  }
}

function removeTheCopy(root: string): void {
  unlinkTheDependencies(path.join(root, 'node_modules'));
  if (existsSync(path.join(root, 'node_modules'))) throw new Error(`The copy at ${root} still links node_modules; nothing was removed`);
  rmSync(root, { recursive: true, force: true });
}

export function aCopyOfTheCheckout({ asGitRepository = false }: { asGitRepository?: boolean } = {}): CheckoutCopy {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'serplists-checkout-')));
  for (const file of filesOfTheCheckout()) {
    const source = path.join(REPO_ROOT, file);
    if (!existsSync(source)) continue;
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    copyFileSync(source, path.join(root, file));
  }
  symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(root, 'node_modules'), 'junction');
  if (asGitRepository) {
    git(root, ['init', '-q', '-b', 'staging']);
    git(root, ['add', '-A']);
    git(root, ['-c', 'user.name=Copy', '-c', 'user.email=copy@example.test', 'commit', '-q', '-m', 'copy']);
  }
  const rawCoverage = process.env[CHILD_COVERAGE_VARIABLE];
  if (rawCoverage) appendFileSync(checkoutCopiesListOf(rawCoverage), `${root}\n`);
  return { root, remove: () => removeTheCopy(root) };
}
