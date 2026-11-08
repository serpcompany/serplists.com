import { spawn } from 'node:child_process';
import path from 'node:path';
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

export async function runScriptProcess(
  script: string,
  { args = [], cwd = REPO_ROOT, env = process.env, preloads = [] }: ScriptProcessOptions = {},
): Promise<ScriptProcessRun> {
  const { command, args: invocationArgs, options } = buildScriptInvocation(path.join(REPO_ROOT, script), args);
  const preloadFlags = preloads.flatMap((preload) => ['--import', pathToFileURL(path.join(REPO_ROOT, preload)).href]);
  const child = spawn(
    command,
    [...invocationArgs.slice(0, AFTER_THE_TSX_LOADER), ...preloadFlags, ...invocationArgs.slice(AFTER_THE_TSX_LOADER)],
    { ...options, cwd, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const chunks = { stdout: '', stderr: '' };
  child.stdout.on('data', (chunk: Buffer) => (chunks.stdout += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (chunks.stderr += chunk.toString()));
  const status = await new Promise<number | null>((exited, failed) => {
    child.once('error', failed);
    child.once('close', exited);
  });
  return { status, ...chunks };
}
