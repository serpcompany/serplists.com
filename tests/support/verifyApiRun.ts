import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import { afterAll } from 'vitest';
import { z } from 'zod';

import type { CheckoutCopy } from './checkoutCopy';
import { aCopyOfTheCheckoutWithStandIns, runTheCopysScriptToTheEnd } from './checkoutCopyWithStandIns';
import { listeningPort } from './listeningPort';
import { NEXT_DEV_STAND_IN } from './nextDevStandIn';

export const SECRET = 'slrk_verify_api_test_secret';
export const COOKIE = 'session=verify-api-test-cookie';
const SECRET_THE_MCP_REFUSES = 'slrk_verify_api_secret_the_mcp_refuses';
export const SLOW = 60_000;
const plans = mkdtempSync(path.join(tmpdir(), 'verify-api-plans-'));
const checkout = await aCopyOfTheCheckoutWithStandIns(NEXT_DEV_STAND_IN, { asGitRepository: true });

export const theCheckoutCopy = (): CheckoutCopy => checkout;

afterAll(async () => {
  rmSync(plans, { recursive: true, force: true });
  await checkout.remove();
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

type ScriptOptions = { env?: Record<string, string>; preloads?: readonly string[] };

export async function runTheScript(args: readonly string[], options: ScriptOptions = {}) {
  const { status, stdout, stderr } = await runTheCopysScriptToTheEnd(theCheckoutCopy(), '.claude/skills/verify-api/run.ts', { args, ...options });
  return { status, output: `${stdout}${stderr}` };
}

type StandInOptions = { onRequest?: (route: string) => void };

export async function withTheStandInApi<T>(run: (origin: string, seen: readonly Seen[]) => Promise<T>, { onRequest }: StandInOptions = {}) {
  const seen: Seen[] = [];
  const server = createServer((request, response) => {
    void text(request).then((body) => {
      const { cookie, authorization } = request.headers;
      seen.push({ method: request.method ?? 'GET', path: request.url ?? '/', cookie, authorization });
      onRequest?.(`${request.method ?? 'GET'} ${request.url ?? '/'}`);
      answer(request, body, response, seen.length);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await run(`http://127.0.0.1:${listeningPort(server)}`, seen);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

export function aPlanFile(name: string, plan: unknown): string {
  const planFile = path.join(plans, `${name}.json`);
  if (plan !== undefined) writeFileSync(planFile, typeof plan === 'string' ? plan : JSON.stringify(plan));
  return planFile;
}

export function theProofFolderOf(runName: string): string {
  const verifyFolders = path.join(theCheckoutCopy().root, 'tmp', 'agent', 'verify');
  const made = (existsSync(verifyFolders) ? readdirSync(verifyFolders) : [])
    .filter((folder) => /^\d{4}-\d{2}-\d{2}-/.test(folder) && folder.slice(11) === runName)
    .map((folder) => path.join(verifyFolders, folder));
  if (made.length > 1) throw new Error(`Expected at most one verify folder for ${runName}, found ${made.length}`);
  return made.join('');
}

export async function verifyApi(name: string, plan: unknown, extra: string[] = []) {
  const planFile = aPlanFile(name, plan);
  const runName = `test-${name}-${process.pid}`;
  return withTheStandInApi(async (origin, seen) => {
    const result = await runTheScript([runName, planFile, ...(extra.length > 0 ? extra : ['--base', origin])]);
    return { ...result, seen, folder: theProofFolderOf(runName) };
  });
}

export const proof = (folder: string, file: string) => readFileSync(path.join(folder, file), 'utf8');
