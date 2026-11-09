import { spawn } from 'node:child_process';
import path from 'node:path';

import { buildScriptInvocation, REPO_ROOT } from '../../scripts/lib/run-tool';
import { ranToTheEnd } from './scriptProcess';

export type ScriptRun = { status: number | null; stdout: string; stderr: string; output: string };

type RunOptions = { cwd?: string; env?: Record<string, string | undefined>; timeoutMs?: number };

const TSCONFIG = { TSX_TSCONFIG_PATH: path.join(REPO_ROOT, 'tsconfig.json') };

const invocationOf = (script: string, args: readonly string[]) => buildScriptInvocation(path.join(REPO_ROOT, script), args);

export async function runRepositoryScript(script: string, args: readonly string[] = [], { cwd = REPO_ROOT, env = {}, timeoutMs = 60_000 }: RunOptions = {}): Promise<ScriptRun> {
  const { command, args: invocationArgs } = invocationOf(script, args);
  const run = await ranToTheEnd(command, invocationArgs, { cwd, env: { ...process.env, ...TSCONFIG, ...env }, timeout: timeoutMs });
  return { ...run, output: `${run.stdout}${run.stderr}` };
}

export function runRepositoryScriptWhileServing(script: string, args: readonly string[] = [], { cwd = REPO_ROOT, env = {} }: RunOptions = {}): Promise<ScriptRun> {
  const { command, args: invocationArgs } = invocationOf(script, args);
  const child = spawn(command, invocationArgs, { cwd, env: { ...process.env, ...TSCONFIG, ...env } });
  const streams = { stdout: '', stderr: '' };
  child.stdout.on('data', (chunk: Buffer) => (streams.stdout += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (streams.stderr += chunk.toString()));
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (status) => resolve({ status, ...streams, output: `${streams.stdout}${streams.stderr}` }));
  });
}
