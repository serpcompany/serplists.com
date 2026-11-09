import { type ChildProcess, spawn } from 'node:child_process';
import { copyFile, lstat, mkdir, readdir, rmdir, symlink, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildScriptInvocation, REPO_ROOT } from '../../scripts/lib/run-tool';
import { aCopyOfTheCheckout, type CheckoutCopy, isALinkOrJunction, unlinkWithoutFollowing } from './checkoutCopy';
import type { ScriptProcessRun } from './scriptProcess';

type StandInPackages = Readonly<Record<string, Readonly<Record<string, string>>>>;

type Replaced = ReadonlyMap<string, readonly string[]>;

export type CopyWithAStandInPackage = CheckoutCopy & { standInFolder: string };

function replacedEntries(packageNames: readonly string[]): Replaced {
  const replaced = new Map<string, string[]>();
  for (const name of packageNames) {
    const [first = name, ...inside] = name.split('/');
    replaced.set(first, [...(replaced.get(first) ?? []), ...inside]);
  }
  return replaced;
}

async function linkTheModulesExcept(from: string, to: string, replaced: Replaced): Promise<void> {
  await mkdir(to);
  const entries = await readdir(from, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const source = path.join(from, entry.name);
      const target = path.join(to, entry.name);
      const inside = replaced.get(entry.name);
      if (inside !== undefined) {
        if (inside.length > 0) await linkTheModulesExcept(source, target, replacedEntries(inside));
      } else if (entry.isFile()) {
        await copyFile(source, target);
      } else {
        await symlink(source, target, 'junction');
      }
    }),
  );
}

async function removeTheLinkedModules(folder: string): Promise<void> {
  const entries = await readdir(folder);
  await Promise.all(
    entries.map(async (entry) => {
      const at = path.join(folder, entry);
      if (await isALinkOrJunction(at)) await unlinkWithoutFollowing(at);
      else if ((await lstat(at)).isDirectory()) await removeTheLinkedModules(at);
      else await unlink(at);
    }),
  );
  await rmdir(folder);
}

export async function aCopyOfTheCheckoutWithStandIns(packages: StandInPackages, options: { asGitRepository?: boolean } = {}): Promise<CheckoutCopy> {
  const copy = await aCopyOfTheCheckout(options);
  const modules = path.join(copy.root, 'node_modules');
  await unlinkWithoutFollowing(modules);
  await linkTheModulesExcept(path.join(REPO_ROOT, 'node_modules'), modules, replacedEntries(Object.keys(packages)));
  for (const [name, files] of Object.entries(packages)) {
    const folder = path.join(modules, ...name.split('/'));
    await mkdir(folder, { recursive: true });
    for (const [file, text] of Object.entries(files)) await writeFile(path.join(folder, file), text);
  }
  return {
    root: copy.root,
    remove: async () => {
      await removeTheLinkedModules(modules);
      await copy.remove();
    },
  };
}

export async function aCopyOfTheCheckoutWithAStandInPackage({ name, files }: { name: string; files: Record<string, string> }): Promise<CopyWithAStandInPackage> {
  const copy = await aCopyOfTheCheckoutWithStandIns({ [name]: files });
  return { ...copy, standInFolder: path.join(copy.root, 'node_modules', ...name.split('/')) };
}

type RunningScript = {
  child: ChildProcess;
  printed: (text: string) => Promise<void>;
  finished: Promise<ScriptProcessRun>;
};

type StartOptions = { args?: readonly string[]; cwd?: string; env?: Record<string, string | undefined>; execPath?: string; preloads?: readonly string[] };

export function startTheCopysScript(copy: CheckoutCopy, script: string, { args = [], cwd = copy.root, env = {}, execPath, preloads = [] }: StartOptions = {}): RunningScript {
  const invocation = buildScriptInvocation(path.join(copy.root, script), args, execPath === undefined ? {} : { execPath });
  const [importFlag = '', loader = '', ...rest] = invocation.args;
  const preloadFlags = preloads.flatMap((preload) => ['--import', pathToFileURL(preload).href]);
  const child = spawn(invocation.command, [importFlag, loader, ...preloadFlags, ...rest], { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const streams = { stdout: '', stderr: '' };
  const waiting = new Set<() => void>();
  const hear = (stream: 'stdout' | 'stderr') => (chunk: Buffer) => {
    streams[stream] += chunk.toString();
    for (const check of waiting) check();
  };
  child.stdout.on('data', hear('stdout'));
  child.stderr.on('data', hear('stderr'));
  const finished = new Promise<ScriptProcessRun>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (status: number | null) => {
      for (const check of waiting) check();
      resolve({ status, ...streams });
    });
  });
  const printed = (text: string) =>
    new Promise<void>((resolve, reject) => {
      const check = () => {
        if (`${streams.stdout}${streams.stderr}`.includes(text)) {
          waiting.delete(check);
          resolve();
        } else if (child.exitCode !== null || child.signalCode !== null) {
          waiting.delete(check);
          reject(new Error(`${script} ended without printing "${text}":\n${streams.stdout}${streams.stderr}`));
        }
      };
      waiting.add(check);
      check();
    });
  return { child, printed, finished };
}

export const runTheCopysScriptToTheEnd = (copy: CheckoutCopy, script: string, options: StartOptions = {}): Promise<ScriptProcessRun> =>
  startTheCopysScript(copy, script, options).finished;
