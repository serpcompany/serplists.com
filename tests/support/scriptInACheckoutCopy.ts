import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

import { DATABASE_NAME, parseSeedStatus, type SeedStatus } from '../../scripts/lib/local-d1-seed';
import { buildScriptInvocation, buildToolInvocation, type Invocation, REPO_ROOT } from '../../scripts/lib/run-tool';
import { parseWranglerResultSets } from '../../scripts/lib/wrangler-json';
import type { CheckoutCopy } from './checkoutCopy';
import type { ScriptProcessRun } from './scriptProcess';

type CopyRunOptions = { args?: readonly string[]; env?: NodeJS.ProcessEnv; preload?: string };

const exitCodeSchema = z.number().nullable();

async function ranInTheCopy(copy: CheckoutCopy, { command, args, options }: Invocation, env: NodeJS.ProcessEnv): Promise<ScriptProcessRun> {
  const child = spawn(command, args, { ...options, cwd: copy.root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const [stdout, stderr, status] = await Promise.all([
    text(child.stdout),
    text(child.stderr),
    once(child, 'close').then(([code]: unknown[]) => exitCodeSchema.parse(code)),
  ]);
  return { status, stdout, stderr };
}

export function runTheCopysScript(copy: CheckoutCopy, script: string, { args = [], env = process.env, preload }: CopyRunOptions = {}): Promise<ScriptProcessRun> {
  const invocation = buildScriptInvocation(path.join(copy.root, script), args);
  const loader = invocation.args.slice(0, -1 - args.length);
  const preloadFlags = preload === undefined ? [] : ['--import', pathToFileURL(path.join(REPO_ROOT, preload)).href];
  return ranInTheCopy(copy, { ...invocation, args: [...loader, ...preloadFlags, ...invocation.args.slice(loader.length)] }, env);
}

export const localD1DatabasesOf = (copy: CheckoutCopy): string =>
  path.join(copy.root, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');

export async function seedStatusOf(copy: CheckoutCopy): Promise<SeedStatus> {
  const run = await runTheCopysScript(copy, 'scripts/data/local-d1-data.ts', { args: ['seed-status'] });
  return parseSeedStatus(run.stdout);
}

export async function queryTheCopysLocalD1(copy: CheckoutCopy, statement: string): Promise<unknown[]> {
  const invocation = buildToolInvocation('wrangler', ['d1', 'execute', DATABASE_NAME, '--local', '--json', '--command', statement]);
  const run = await ranInTheCopy(copy, invocation, { ...process.env, CI: '1' });
  if (run.status !== 0) throw new Error(`wrangler could not run ${statement} on the copy's local D1: ${run.stderr}${run.stdout}`);
  return parseWranglerResultSets(run.stdout).flatMap(({ results = [] }) => results);
}
