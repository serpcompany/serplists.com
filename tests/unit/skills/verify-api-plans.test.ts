import { describe, expect, it } from 'vitest';

import { arrayContaining } from '../../support/asymmetricMatchers';
import { proof, runTheScript, SLOW, verifyApi } from '../../support/verifyApiRun';

const USAGE = 'Usage: node --import tsx .claude/skills/verify-api/run.ts <name> <plan.json> [--base <url>]';

const requestLines = (folder: string) => proof(folder, 'requests.txt').split('\n').filter(Boolean);

describe('the verify-api plan steps', () => {
  it('checks the status an API step expects, keeps a body that is not JSON as text, and fills references to numbers', async () => {
    const run = await verifyApi('statuses', {
      permissions: ['templates:read'],
      steps: [
        { api: 'GET /api/templates' },
        { api: 'GET /api/missing', expect: 404 },
        { api: 'GET /api/plain' },
        { api: 'POST /api/templates/{$1.0.count}', body: { copies: '{$1.0.count}', note: 'copy {$1.0.id}', tags: ['{$1.0.id}'], draft: true } },
      ],
    });

    expect(run.status).toBe(1);
    expect(requestLines(run.folder).slice(0, 4)).toEqual([
      '01 as expected: 200 (expected 2xx) GET /api/templates, request request-5',
      '02 as expected: 404 (expected 404) GET /api/missing, request request-6',
      '03 as expected: 200 (expected 2xx) GET /api/plain, request without an id',
      '04 UNEXPECTED: 404 (expected 2xx) POST /api/templates/2, request request-8',
    ]);
    expect(JSON.parse(proof(run.folder, '03.json'))).toMatchObject({ answer: 'plain text, not JSON' });
    expect(JSON.parse(proof(run.folder, '04.json'))).toMatchObject({
      sent: { body: { copies: 2, note: 'copy template-1', tags: ['template-1'], draft: true } },
    });
    expect(proof(run.folder, 'server.log')).toBe('No log: this run\'s server writes none to tmp/logs/dev-all.log.\n');
  }, SLOW);

  it('reads an MCP method step, a JSON-RPC error, and a tool error without a code', async () => {
    const run = await verifyApi('mcp', {
      steps: [
        { mcp: 'tools/list', expect: 'ok' },
        { mcp: 'resources/list', params: { cursor: 'next' }, expect: 'rpc -32602' },
        { tool: 'archive_run', expect: 'error' },
      ],
    });

    expect(run.status).toBe(0);
    expect(requestLines(run.folder).slice(0, 3)).toEqual([
      '01 as expected: ok (expected ok) MCP tools/list, request request-5',
      '02 as expected: rpc -32602 (expected rpc -32602) MCP resources/list, request request-6',
      '03 as expected: error (expected error) MCP archive_run, request request-7',
    ]);
  }, SLOW);

  it.each([
    ['a step not run yet', [{ api: 'GET /api/templates/{$2.id}' }], '{$2.id} names step 2, which hasn\'t run yet.'],
    ['a path the answer lacks', [{ api: 'GET /api/templates' }, { tool: 'get_template', arguments: { templateId: '{$1.0.slug}' } }], "Step 1's answer has nothing at 0.slug."],
    ['a path through a number', [{ api: 'GET /api/templates' }, { api: 'GET /api/templates/{$1.0.count.digits}' }], "Step 1's answer has nothing at 0.count.digits."],
    [
      'a reference that leaves the step no route',
      [{ tool: 'start_run', expect: 'limit_reached' }, { api: 'GET /api/runs/{$1.message}' }],
      'Step 2 reads "GET /api/runs/One active run." once its references are filled in',
    ],
  ])('stops at %s, and still revokes the key and signs out', async (_what, steps, message) => {
    const run = await verifyApi(`reference-${steps.length}-${message.length}`, { steps });

    expect(run.status).toBe(1);
    expect(run.output).toContain(message);
    expect(run.seen.map((request) => `${request.method} ${request.path}`)).toEqual(
      arrayContaining(['DELETE /api/agent-keys/key-1', 'POST /api/auth/sign-out']),
    );
  }, SLOW);

  it('reports an MCP endpoint that refuses the Run Key, in the doctor and in each MCP step', async () => {
    const run = await verifyApi('mcp-refused', { permissions: ['templates:write'], steps: [{ tool: 'list_templates', expect: 'HTTP 404' }] });

    expect(run.status).toBe(0);
    expect(proof(run.folder, 'doctor.txt')).toContain('mcp: initialize answered 404');
    expect(requestLines(run.folder)[0]).toBe('01 as expected: HTTP 404 (expected HTTP 404) MCP list_templates, request request-5');
  }, SLOW);

  it('stops before making a key when the user cannot sign in', async () => {
    const run = await verifyApi('sign-in', { user: 'owner@test.com', password: 'wrong', steps: [{ api: 'GET /api/templates' }] });

    expect(run.status).toBe(1);
    expect(run.output).toContain('Signing in as owner@test.com answered 401. Seed the users with pnpm run db:seed');
    expect(run.seen.map((request) => request.path)).not.toContain('/api/agent-keys');
  }, SLOW);
});

describe('the verify-api command line', () => {
  it.each([
    ['a run name with capitals', ['Bad-Name', 'plan.json']],
    ['no plan file', ['run-name']],
    ['an argument too many', ['run-name', 'plan.json', 'extra']],
    ['--base without a server', ['run-name', 'plan.json', '--base']],
  ])('answers %s with the usage and exit status 2', async (_what, args) => {
    const run = await runTheScript(args);

    expect(run.status).toBe(2);
    expect(run.output).toContain(USAGE);
  }, SLOW);

  it('names each field a plan gets wrong', async () => {
    const run = await verifyApi('bad-plan', { steps: [{ api: 'FETCH /api/templates' }], extra: true });

    expect(run.status).toBe(2);
    expect(run.output).toContain('isn\'t a plan: steps.0.api: Write an API step as "<METHOD> /api/<path>"');
    expect(run.output).toContain("plan: Unrecognized key(s) in object: 'extra'");
  }, SLOW);
});
