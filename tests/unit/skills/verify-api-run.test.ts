import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { COOKIE, proof, SECRET, SLOW, verifyApi } from '../../support/verifyApiRun';

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
