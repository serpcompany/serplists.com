import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import { afterAll } from 'vitest';
import { z } from 'zod';

import { buildScriptInvocation } from '../../scripts/lib/run-tool';
import { listeningPort } from './listeningPort';

const repoRoot = process.cwd();
const script = path.join(repoRoot, '.claude', 'skills', 'verify-api', 'run.ts');
export const SECRET = 'slrk_verify_api_test_secret';
export const COOKIE = 'session=verify-api-test-cookie';
const SECRET_THE_MCP_REFUSES = 'slrk_verify_api_secret_the_mcp_refuses';
export const SLOW = 60_000;
const plans = mkdtempSync(path.join(tmpdir(), 'verify-api-plans-'));
const runFolders: string[] = [];
const verifyFolders = path.join(repoRoot, 'tmp', 'agent', 'verify');

afterAll(() => {
  rmSync(plans, { recursive: true, force: true });
  for (const folder of runFolders) rmSync(folder, { recursive: true, force: true });
});

const rpcRequestSchema = z.object({
  id: z.number(),
  method: z.string(),
  params: z.object({ name: z.string().optional(), arguments: z.record(z.unknown()).optional() }).passthrough().optional(),
});

type Seen = { method: string; path: string; cookie: string | undefined; authorization: string | undefined };

function answerRpc(body: string): unknown {
  const request = rpcRequestSchema.parse(JSON.parse(body));
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id: request.id, result });
  if (request.method === 'initialize') return reply({ serverInfo: { name: 'serp-lists', version: '0.6.0' } });
  if (request.method === 'tools/list') return reply({ tools: [{ name: 'list_templates' }] });
  const tool = request.params?.name;
  if (tool === 'list_templates') return reply({ structuredContent: { templates: [{ id: 'template-1', title: 'Launch' }] } });
  if (tool === 'get_template' && request.params?.arguments?.['templateId'] === 'template-1') {
    return reply({ structuredContent: { template: { id: 'template-1', title: 'Launch' } } });
  }
  if (tool === 'start_run') return reply({ isError: true, structuredContent: { error: 'limit_reached', message: 'One active run.' } });
  if (tool === 'archive_run') return reply({ isError: true, structuredContent: { message: 'No error code.' } });
  return { jsonrpc: '2.0', id: request.id, error: { code: -32602, message: 'Unknown tool' } };
}

function answer(request: IncomingMessage, body: string, response: ServerResponse, count: number) {
  const route = `${request.method ?? 'GET'} ${new URL(request.url ?? '/', 'http://localhost').pathname}`;
  const send = (status: number, payload: unknown, headers: Record<string, string> = {}) => {
    response.writeHead(status, { 'content-type': 'application/json', 'x-request-id': `request-${count}`, ...headers });
    response.end(JSON.stringify(payload));
  };
  const signedIn = request.headers.cookie === COOKIE;
  if (route === 'GET /api/health') return send(200, { status: 'ok', release: { commit: 'unknown', environment: 'local' } });
  if (route === 'POST /api/auth/sign-in/email') {
    return body.includes('"password123"') ? send(200, { ok: true }, { 'set-cookie': `${COOKIE}; Path=/; HttpOnly` }) : send(401, {});
  }
  if (route === 'POST /api/auth/sign-out') return send(200, { success: true });
  if (route === 'POST /api/agent-keys' && signedIn && body.includes('"templates:write"')) {
    return send(201, { key: { id: 'key-1', permissions: ['templates:write'] }, secret: SECRET_THE_MCP_REFUSES });
  }
  if (route === 'POST /api/agent-keys' && signedIn) {
    return send(201, { key: { id: 'key-1', permissions: ['templates:read', 'runs:read', 'runs:write'] }, secret: SECRET });
  }
  if (route === 'DELETE /api/agent-keys/key-1' && signedIn) return send(200, { id: 'key-1', revokedAt: '2026-10-12T00:00:00Z' });
  if (route === 'GET /api/templates' && signedIn) return send(200, [{ id: 'template-1', count: 2 }]);
  if (route === 'GET /api/plain' && signedIn) {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('plain text, not JSON');
    return undefined;
  }
  if (route === 'POST /api/mcp' && request.headers.authorization === `Bearer ${SECRET}`) return send(200, answerRpc(body));
  return send(404, { error: 'Not found' });
}

export function runTheScript(args: readonly string[]) {
  const invocation = buildScriptInvocation(script, args);
  return new Promise<{ status: number | null; output: string }>((resolve) => {
    const child = spawn(invocation.command, invocation.args, { cwd: repoRoot });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('close', (status) => resolve({ status, output }));
  });
}

export async function verifyApi(name: string, plan: unknown, extra: string[] = []) {
  const seen: Seen[] = [];
  const server = createServer((request, response) => {
    void text(request).then((body) => {
      const { cookie, authorization } = request.headers;
      seen.push({ method: request.method ?? 'GET', path: request.url ?? '/', cookie, authorization });
      answer(request, body, response, seen.length);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const planFile = path.join(plans, `${name}.json`);
  if (plan !== undefined) writeFileSync(planFile, typeof plan === 'string' ? plan : JSON.stringify(plan));
  const runName = `test-${name}-${process.pid}`;
  const base = extra.length > 0 ? extra : ['--base', `http://127.0.0.1:${listeningPort(server)}`];
  try {
    const result = await runTheScript([runName, planFile, ...base]);
    const made = (existsSync(verifyFolders) ? readdirSync(verifyFolders) : [])
      .filter((folder) => /^\d{4}-\d{2}-\d{2}-/.test(folder) && folder.slice(11) === runName)
      .map((folder) => path.join(verifyFolders, folder));
    runFolders.push(...made);
    if (made.length > 1) throw new Error(`Expected at most one verify folder for ${runName}, found ${made.length}`);
    return { ...result, seen, folder: made.join('') };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

export const proof = (folder: string, file: string) => readFileSync(path.join(folder, file), 'utf8');
