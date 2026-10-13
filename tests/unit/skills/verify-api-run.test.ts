import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildScriptInvocation } from '../../../scripts/lib/run-tool';
import { listeningPort } from '../../support/listeningPort';

const repoRoot = process.cwd();
const script = path.join(repoRoot, '.claude', 'skills', 'verify-api', 'run.ts');
const SECRET = 'slrk_verify_api_test_secret';
const COOKIE = 'session=verify-api-test-cookie';
const SLOW = 60_000;
const plans = mkdtempSync(path.join(tmpdir(), 'verify-api-plans-'));
const runFolders: string[] = [];

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
  const tool = request.params?.name;
  if (tool === 'list_templates') return reply({ structuredContent: { templates: [{ id: 'template-1', title: 'Launch' }] } });
  if (tool === 'get_template' && request.params?.arguments?.['templateId'] === 'template-1') {
    return reply({ structuredContent: { template: { id: 'template-1', title: 'Launch' } } });
  }
  if (tool === 'start_run') return reply({ isError: true, structuredContent: { error: 'limit_reached', message: 'One active run.' } });
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
  if (route === 'POST /api/agent-keys' && signedIn) {
    return send(201, { key: { id: 'key-1', permissions: ['templates:read', 'runs:read', 'runs:write'] }, secret: SECRET });
  }
  if (route === 'DELETE /api/agent-keys/key-1' && signedIn) return send(200, { id: 'key-1', revokedAt: '2026-10-12T00:00:00Z' });
  if (route === 'GET /api/templates' && signedIn) return send(200, [{ id: 'template-1' }]);
  if (route === 'POST /api/mcp' && request.headers.authorization === `Bearer ${SECRET}`) return send(200, answerRpc(body));
  return send(404, { error: 'Not found' });
}

async function verifyApi(name: string, plan: unknown, extra: string[] = []) {
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
  runFolders.push(path.join(repoRoot, 'tmp', 'agent', 'verify', `${new Date().toISOString().slice(0, 10)}-${runName}`));
  const base = extra.length > 0 ? extra : ['--base', `http://127.0.0.1:${listeningPort(server)}`];
  const invocation = buildScriptInvocation(script, [runName, planFile, ...base]);
  try {
    const result = await new Promise<{ status: number | null; output: string }>((resolve) => {
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
    return { ...result, seen, folder: runFolders[runFolders.length - 1] ?? '' };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const proof = (folder: string, file: string) => readFileSync(path.join(folder, file), 'utf8');

describe('the verify-api script', () => {
  it('runs each step as the signed-in user with a Run Key, keeps every answer, then revokes the key and signs out', async () => {
    const run = await verifyApi('drives', {
      steps: [
        { api: 'GET /api/templates' },
        { tool: 'list_templates', arguments: { limit: 5 } },
        { tool: 'get_template', arguments: { templateId: '{$2.templates.0.id}' } },
        { tool: 'start_run', arguments: { templateId: '{$3.template.id}' }, expect: 'limit_reached' },
      ],
    });
    expect(run.output).toContain('Proof: ');
    expect(run.status).toBe(0);
    expect(proof(run.folder, 'requests.txt').split('\n').filter(Boolean)).toEqual([
      '01 as expected: 200 (expected 2xx) GET /api/templates, request request-5',
      '02 as expected: ok (expected ok) MCP list_templates, request request-6',
      '03 as expected: ok (expected ok) MCP get_template, request request-7',
      '04 as expected: limit_reached (expected limit_reached) MCP start_run, request request-8',
      'cleanup: revoked the Run Key key-1: 200',
      'cleanup: signed out: 200',
    ]);
    expect(proof(run.folder, '03.json')).toContain('"templateId": "template-1"');
    expect(proof(run.folder, 'doctor.txt')).toContain('mcp: serp-lists 0.6.0');
    expect(run.seen.map((request) => `${request.method} ${request.path}`)).toContain('DELETE /api/agent-keys/key-1');
    for (const file of readdirSync(run.folder)) {
      expect(proof(run.folder, file), file).not.toContain(SECRET);
      expect(proof(run.folder, file), file).not.toContain(COOKIE);
    }
  }, SLOW);

  it('fails the run when an answer is not the one the plan expects', async () => {
    const run = await verifyApi('unexpected', { steps: [{ tool: 'start_run', arguments: { templateId: 'template-1' } }] });
    expect(run.status).toBe(1);
    expect(run.output).toContain('01 UNEXPECTED: limit_reached (expected ok) MCP start_run');
    expect(run.output).toContain("1 of 1 answers weren't what the plan expected.");
  }, SLOW);

  it('refuses a plan with no steps before it signs in, since a run that asks for nothing proves nothing', async () => {
    const run = await verifyApi('empty', { steps: [] });
    expect(run.status).toBe(2);
    expect(run.output).toContain('a run that asks for nothing proves nothing');
    expect(run.seen).toEqual([]);
  }, SLOW);

  it.each([
    ['a plan file that is missing', 'missing', undefined],
    ['a plan file that is not JSON', 'not-json', 'steps:\n  - api: GET /api/templates\n'],
  ])('answers %s with the usage and exit status 2, before it signs in', async (_what, name, plan) => {
    const run = await verifyApi(name, plan);
    expect(run.status).toBe(2);
    expect(run.output).toContain("can't be read as JSON");
    expect(run.output).toContain('Usage: node --import tsx .claude/skills/verify-api/run.ts');
    expect(run.seen).toEqual([]);
  }, SLOW);

  it('refuses a server that is not on this machine, so it never makes a Run Key on Staging or Production', async () => {
    const run = await verifyApi('remote', { steps: [{ api: 'GET /api/templates' }] }, ['--base', 'https://serplists.com']);
    expect(run.status).toBe(1);
    expect(run.output).toContain("https://serplists.com isn't this machine");
  }, SLOW);
});
