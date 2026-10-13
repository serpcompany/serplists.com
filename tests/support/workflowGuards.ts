import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { afterAll } from 'vitest';
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

type ReceivedRequest = { method: string; body: string };

export async function withAFakeGitHubApi<T>(
  answer: (url: URL, response: ServerResponse, request: ReceivedRequest) => void,
  run: (apiUrl: string) => Promise<T>,
) {
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on('end', () => answer(new URL(request.url ?? '/', 'http://localhost'), response, { method: request.method ?? 'GET', body }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await run(`http://127.0.0.1:${listeningPort(server)}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

export function runNodeScript(
  scriptPath: string,
  env: Record<string, string>,
  streams: ReadonlyArray<'stdout' | 'stderr'> = ['stdout', 'stderr'],
  { cwd }: { cwd?: string } = {},
) {
  const child = spawn(process.execPath, [scriptPath], { env: { ...process.env, ...env }, ...(cwd === undefined ? {} : { cwd }) });
  let output = '';
  const collect = (chunk: Buffer) => {
    output += chunk.toString();
  };
  for (const stream of streams) child[stream].on('data', collect);
  return new Promise<{ status: number | null; output: string }>((resolve) => {
    child.on('close', (status) => resolve({ status, output }));
  });
}
