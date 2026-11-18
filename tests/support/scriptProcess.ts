import { type ChildProcessByStdio, spawn, type SpawnOptions } from 'node:child_process';
import path from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';

import { buildScriptInvocation, REPO_ROOT } from '../../scripts/lib/run-tool';

export type ScriptProcessRun = { status: number | null; stdout: string; stderr: string };

type ScriptProcessOptions = {
  args?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  preloads?: readonly string[];
};

const AFTER_THE_TSX_LOADER = 2;

export function processEnvWithout(prefixes: readonly string[]): NodeJS.ProcessEnv {
  const removed = Object.keys(process.env)
    .filter((name) => prefixes.some((prefix) => name.toUpperCase().startsWith(prefix)))
    .map((name): [string, undefined] => [name, undefined]);
  return { ...process.env, ...Object.fromEntries(removed) };
}

export async function printedUntilClosed(child: ChildProcessByStdio<Writable | null, Readable, Readable>): Promise<ScriptProcessRun> {
  const chunks = { stdout: '', stderr: '' };
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => (chunks.stdout += chunk));
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => (chunks.stderr += chunk));
  const status = await new Promise<number | null>((exited, failed) => {
    child.once('error', failed);
    child.once('close', exited);
  });
  return { status, ...chunks };
}

export async function ranToTheEnd(command: string, args: readonly string[], options: SpawnOptions): Promise<ScriptProcessRun> {
  return printedUntilClosed(spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] }));
}

export function withPreloads(invocationArgs: readonly string[], preloads: readonly string[]): string[] {
  const preloadFlags = preloads.flatMap((preload) => ['--import', pathToFileURL(path.join(REPO_ROOT, preload)).href]);
  return [...invocationArgs.slice(0, AFTER_THE_TSX_LOADER), ...preloadFlags, ...invocationArgs.slice(AFTER_THE_TSX_LOADER)];
}

export function runScriptProcess(
  script: string,
  { args = [], cwd = REPO_ROOT, env = process.env, preloads = [] }: ScriptProcessOptions = {},
): Promise<ScriptProcessRun> {
  const { command, args: invocationArgs, options } = buildScriptInvocation(path.join(REPO_ROOT, script), args);
  return ranToTheEnd(command, withPreloads(invocationArgs, preloads), { ...options, cwd, env });
}

export function runModuleCodeProcess(code: string): Promise<ScriptProcessRun> {
  const { command, args } = buildScriptInvocation('--input-type=module', ['--eval', code]);
  return ranToTheEnd(command, args, { cwd: REPO_ROOT, env: process.env });
}
