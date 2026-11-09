import { type ChildProcess, spawn } from 'node:child_process';
import { copyFileSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildScriptInvocation, REPO_ROOT } from '../../scripts/lib/run-tool';
import { aCopyOfTheCheckout, type CheckoutCopy } from './checkoutCopy';
import type { ScriptProcessRun } from './scriptProcess';

type StandInPackages = Readonly<Record<string, Readonly<Record<string, string>>>>;

type Replaced = ReadonlyMap<string, readonly string[]>;

function replacedEntries(packageNames: readonly string[]): Replaced {
  const replaced = new Map<string, string[]>();
  for (const name of packageNames) {
    const [first = name, ...inside] = name.split('/');
    replaced.set(first, [...(replaced.get(first) ?? []), ...inside]);
  }
  return replaced;
}

function linkTheModulesExcept(from: string, to: string, replaced: Replaced): void {
  mkdirSync(to);
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    const inside = replaced.get(entry.name);
    if (inside !== undefined) {
      if (inside.length > 0) linkTheModulesExcept(source, target, replacedEntries(inside));
    } else if (entry.isFile()) {
      copyFileSync(source, target);
    } else {
      symlinkSync(source, target, 'junction');
    }
  }
}

const isALinkOrJunction = (entry: string) => lstatSync(entry).isSymbolicLink() || realpathSync(entry) !== entry;

function unlinkWithoutFollowing(link: string): void {
  try {
    unlinkSync(link);
  } catch {
    rmdirSync(link);
  }
}

function removeTheLinkedModules(folder: string): void {
  for (const entry of readdirSync(folder)) {
    const at = path.join(folder, entry);
    if (isALinkOrJunction(at)) unlinkWithoutFollowing(at);
    else if (lstatSync(at).isDirectory()) removeTheLinkedModules(at);
    else unlinkSync(at);
  }
  rmdirSync(folder);
}

export function aCopyOfTheCheckoutWithStandIns(packages: StandInPackages, options: { asGitRepository?: boolean } = {}): CheckoutCopy {
  const copy = aCopyOfTheCheckout(options);
  const modules = path.join(copy.root, 'node_modules');
  unlinkWithoutFollowing(modules);
  linkTheModulesExcept(path.join(REPO_ROOT, 'node_modules'), modules, replacedEntries(Object.keys(packages)));
  for (const [name, files] of Object.entries(packages)) {
    const folder = path.join(modules, ...name.split('/'));
    mkdirSync(folder, { recursive: true });
    for (const [file, text] of Object.entries(files)) writeFileSync(path.join(folder, file), text);
  }
  return {
    root: copy.root,
    remove: () => {
      removeTheLinkedModules(modules);
      copy.remove();
    },
  };
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
