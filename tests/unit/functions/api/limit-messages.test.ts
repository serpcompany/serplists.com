import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiErrorBody, jsonObject, readJson } from '../../../support/readJson';

const fake = vi.hoisted(() => ({ rows: new Map<unknown, unknown[]>(), counts: new Map<unknown, number>() }));

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => {
    const select = vi.fn((fields?: Record<string, unknown>) => {
      let table: unknown;
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        from: (from: unknown) => { table = from; return chain; },
        leftJoin: self,
        innerJoin: self,
        where: self,
        orderBy: self,
        limit: async () => (fields && 'count' in fields ? [{ count: fake.counts.get(table) ?? 0 }] : fake.rows.get(table) ?? []),
      });
      return chain;
    });
    const batch = vi.fn(async () => [{ meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    const write = () => ({ values: vi.fn(), select: vi.fn(), set: vi.fn(() => ({ where: vi.fn() })) });
    return { select, insert: vi.fn(write), update: vi.fn(write), batch };
  }),
}));
vi.mock('@functions/api/utils/session', () => ({ getSessionUserId: vi.fn() }));
vi.mock('@functions/api/utils/entitlements', () => ({
  getEntitlementsForUser: vi.fn(),
  getEntitlementsForContext: vi.fn(),
}));

import { schema } from '@functions/api/db';
import { handleChecklists } from '@functions/api/handlers/checklists';
import { handleTemplates } from '@functions/api/handlers/templates';
import { getEntitlementsForContext, getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';
import { apiEnv } from '../../../support/apiEnv';

const env = apiEnv({ BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' });
const free = { plan: 'free' as const, limits: { maxTemplates: 1, maxActiveRuns: 3 } };
const pro = { plan: 'pro' as const, limits: { maxTemplates: null, maxActiveRuns: null } };
const sections = [{ id: 's1', title: 'S', items: [{ id: 'i1', title: 'Task' }] }];
const archivedAt = '2026-09-01T00:00:00.000Z';

type Case = {
  name: string;
  context: 'personal' | 'organization';
  resource: 'active_runs' | 'templates';
  handler: typeof handleChecklists;
  path: string;
  method: string;
  body?: unknown;
  run?: Record<string, unknown>;
  template?: Record<string, unknown>;
};

const personalRun = { id: 'run-1', user_id: 'user-1', team_id: null, status: 'in_progress', revision: 2, items: '[]' };
const orgRun = { ...personalRun, team_id: 'org-1' };
const personalTemplate = { id: 'tpl-1', user_id: 'user-1', owner_type: 'user', team_id: null, deleted_at: archivedAt };
const orgTemplate = { ...personalTemplate, owner_type: 'team', team_id: 'org-1' };

const cases: Case[] = [
  { name: 'start a run', context: 'personal', resource: 'active_runs', handler: handleChecklists, path: '/api/checklists', method: 'POST', body: { title: 'Run', sections } },
  { name: 'start a run', context: 'organization', resource: 'active_runs', handler: handleChecklists, path: '/api/checklists', method: 'POST', body: { title: 'Run', sections, teamId: 'org-1' } },
  { name: 'restore a run', context: 'personal', resource: 'active_runs', handler: handleChecklists, path: '/api/checklists/run-1/restore', method: 'POST', run: { ...personalRun, deleted_at: archivedAt } },
  { name: 'restore a run', context: 'organization', resource: 'active_runs', handler: handleChecklists, path: '/api/checklists/run-1/restore', method: 'POST', run: { ...orgRun, deleted_at: archivedAt } },
  { name: 'reopen a run', context: 'personal', resource: 'active_runs', handler: handleChecklists, path: '/api/checklists/run-1', method: 'PUT', body: { status: 'in_progress', expected_revision: 2 }, run: { ...personalRun, status: 'completed', deleted_at: null } },
  { name: 'reopen a run', context: 'organization', resource: 'active_runs', handler: handleChecklists, path: '/api/checklists/run-1', method: 'PUT', body: { status: 'in_progress', expected_revision: 2 }, run: { ...orgRun, status: 'completed', deleted_at: null } },
  { name: 'create a template', context: 'personal', resource: 'templates', handler: handleTemplates, path: '/api/templates', method: 'POST', body: { title: 'Template', sections } },
  { name: 'create a template', context: 'organization', resource: 'templates', handler: handleTemplates, path: '/api/templates', method: 'POST', body: { title: 'Template', sections, teamId: 'org-1' } },
  { name: 'clone a template', context: 'organization', resource: 'templates', handler: handleTemplates, path: '/api/templates/tpl-1/clone', method: 'POST', body: { teamId: 'org-1' } },
  { name: 'restore a template', context: 'personal', resource: 'templates', handler: handleTemplates, path: '/api/templates/tpl-1/restore', method: 'POST', template: personalTemplate },
  { name: 'restore a template', context: 'organization', resource: 'templates', handler: handleTemplates, path: '/api/templates/tpl-1/restore', method: 'POST', template: orgTemplate },
];

describe('limit_reached names the context whose limit was hit, and offers Pro only for a Personal one, since Personal Pro never lifts an Organization limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.rows.clear();
    fake.counts.clear();
    fake.rows.set(schema.teamMembers, [{ id: 'member-1', team_id: 'org-1', user_id: 'user-1', role: 'owner', status: 'active' }]);
    fake.counts.set(schema.checklistRuns, 3);
    fake.counts.set(schema.templates, 1);
    vi.mocked(getSessionUserId).mockResolvedValue('user-1');
    vi.mocked(getEntitlementsForContext).mockResolvedValue(free);
  });

  it.each(cases)('$name in $context context', async ({ context, resource, handler, path: route, method, body, run, template }) => {
    const personalPlan = context === 'organization' ? pro : free;
    vi.mocked(getEntitlementsForUser).mockResolvedValue(personalPlan);
    if (run) fake.rows.set(schema.checklistRuns, [run]);
    if (template) fake.rows.set(schema.templates, [template]);

    const response = await handler(new Request(`http://localhost${route}`, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env);
    const data = await readJson(response, apiErrorBody.extend({ details: jsonObject }));

    expect(response.status).toBe(403);
    expect(data.code).toBe('limit_reached');
    expect(data.details).toEqual({ limit: resource === 'templates' ? 1 : 3, current: resource === 'templates' ? 1 : 3, resource, context });
    if (context === 'organization') {
      expect(data.error).not.toMatch(/\bPro\b/);
      expect(data.error).toMatch(/This Organization needs a paid plan/);
    } else {
      expect(data.error).toMatch(/Upgrade to Pro/);
    }
  });
});

describe('copying a public template into Personal on Free', () => {
  it('asks for Pro instead of reporting a template limit, since copying into Personal needs Pro whatever the count', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-1');
    vi.mocked(getEntitlementsForUser).mockResolvedValue(free);

    const response = await handleTemplates(new Request('http://localhost/api/templates/tpl-1/clone', {
      method: 'POST',
      body: JSON.stringify({}),
    }), env);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(403);
    expect(data.code).toBe('upgrade_required');
    expect(data.error).toMatch(/Upgrade to Pro/);
  });
});
