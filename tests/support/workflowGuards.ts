import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { afterAll, expect } from 'vitest';
import { z } from 'zod';
import { listeningPort } from './listeningPort';

export const workflowStepSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  if: z.string().optional(),
  uses: z.string().optional(),
  shell: z.string().optional(),
  run: z.string().optional(),
  env: z.record(z.string()).optional(),
  with: z.record(z.unknown()).optional(),
});

export const readWorkflowFile = (file: string): unknown => yaml.load(readFileSync(file, 'utf8'));

export function aWorkDirRemovedAfterAll(prefix: string) {
  const workDir = mkdtempSync(path.join(tmpdir(), prefix));
  afterAll(() => rmSync(workDir, { recursive: true, force: true }));
  return workDir;
}

export async function withAFakeGitHubApi<T>(
  answer: (url: URL, response: ServerResponse) => void,
  run: (apiUrl: string) => Promise<T>,
) {
  const server = createServer((request, response) => answer(new URL(request.url ?? '/', 'http://localhost'), response));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await run(`http://127.0.0.1:${listeningPort(server)}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

export function writeTheGuardAndItsLog(workDir: string, script: string, executionLog: unknown) {
  const scriptPath = path.join(workDir, 'guard.cjs');
  writeFileSync(scriptPath, script);
  let executionFile = '';
  if (executionLog !== undefined) {
    executionFile = path.join(workDir, 'execution.json');
    writeFileSync(executionFile, JSON.stringify(executionLog));
  }
  return { scriptPath, executionFile };
}

export function runNodeScript(
  scriptPath: string,
  env: Record<string, string>,
  streams: ReadonlyArray<'stdout' | 'stderr'> = ['stdout', 'stderr'],
) {
  const child = spawn(process.execPath, [scriptPath], { env: { ...process.env, ...env } });
  let output = '';
  const collect = (chunk: Buffer) => {
    output += chunk.toString();
  };
  for (const stream of streams) child[stream].on('data', collect);
  return new Promise<{ status: number | null; output: string }>((resolve) => {
    child.on('close', (status) => resolve({ status, output }));
  });
}

export async function expectTheGuardToFailWithNoLogOrAnErrorResult(
  runGuard: (executionLog: unknown) => Promise<{ status: number | null }>,
  resultEntry: (overrides: Record<string, unknown>) => unknown,
) {
  expect((await runGuard(undefined)).status).not.toBe(0);
  expect((await runGuard([{ type: 'system', subtype: 'init' }])).status).not.toBe(0);
  expect((await runGuard([resultEntry({ is_error: true, subtype: 'error_max_turns' })])).status).not.toBe(0);
}
