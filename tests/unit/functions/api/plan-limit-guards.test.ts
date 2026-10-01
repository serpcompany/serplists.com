import { beforeEach, describe, expect, it, vi } from 'vitest';
import { firstOf } from '../../../support/elements';
import { dbMocks, FREE_PLAN, mockEnv, resetToASignedOutVisitorOnTheFreePlan, signInWithPlans } from '../../../support/apiHandlerMocks';
import { z } from 'zod';
import { apiRequest } from '../../../support/apiRequest';
import { jsonObject, readJson } from '../../../support/readJson';

vi.mock('@functions/api/utils/personal-run-key', () => ({
  authenticatePersonalRunKey: vi.fn(),
  markPersonalRunKeyUsed: vi.fn(),
}));

import { handleAgentMcp } from '@functions/api/handlers/agentMcp';
import { handleChecklists } from '@functions/api/handlers/checklists';
import { handleTemplates } from '@functions/api/handlers/templates';
import { authenticatePersonalRunKey } from '@functions/api/utils/personal-run-key';
import { mcpToolCall } from '../../../support/agentMcp';

const lostRace = [{ meta: { changes: 0 } }, { meta: { changes: 0 } }, { meta: { changes: 0 } }];
const mcpToolCallResult = z
  .object({ result: z.object({ isError: z.boolean().optional(), structuredContent: z.unknown() }).passthrough() })
  .passthrough();
const sections = [{ id: 's1', title: 'S', items: [{ id: 'i1', title: 'Task' }] }];

async function expectThePersonalLimitReached(response: Response, details: Record<string, unknown>) {
  const data = await readJson(response, jsonObject);

  expect(response.status).toBe(403);
  expect(data).toEqual(expect.objectContaining({ code: 'limit_reached', details: { ...details, context: 'personal' } }));
  return data;
}

describe('limit-guarded writes that lose the race to another request answer 403 limit_reached, never success', () => {
  beforeEach(() => {
    resetToASignedOutVisitorOnTheFreePlan();
    dbMocks.selectChain.orderBy.mockReturnValue(dbMocks.selectChain);
    dbMocks.insertChain.values.mockReturnValue({ kind: 'insert' });
    dbMocks.insertChain.select.mockReturnValue({ kind: 'guarded-insert' });
    dbMocks.db.batch.mockResolvedValue(lostRace);
    signInWithPlans('user-1', FREE_PLAN);
  });

  it('run create answers 403 and uses only guarded inserts', async () => {
    const activeRunsAtThePreCheck = [{ count: 2 }];
    const activeRunsAfterTheLostRace = [{ count: 3 }];
    dbMocks.selectChain.limit.mockResolvedValueOnce(activeRunsAtThePreCheck).mockResolvedValueOnce(activeRunsAfterTheLostRace);

    const response = await handleChecklists(apiRequest('checklists', 'POST', { title: 'Run', sections }), mockEnv);

    await expectThePersonalLimitReached(response, { limit: 3, current: 3, resource: 'active_runs' });
    expect(firstOf(dbMocks.db.batch.mock.calls)[0]).toEqual([{ kind: 'guarded-insert' }, { kind: 'guarded-insert' }]);
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
  });

  it('run restore answers 403 when the guarded update restores nothing at the limit', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([{ id: 'run-1', user_id: 'user-1', team_id: null, status: 'in_progress', deleted_at: '2026-01-01T00:00:00.000Z' }])
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([{ count: 3 }]);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1/restore', { method: 'POST' }), mockEnv);

    expect(response.status).toBe(403);
    expect((await readJson(response, jsonObject)).code).toBe('limit_reached');
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
  });

  it('template create answers 403 instead of returning the new id', async () => {
    const templatesAtThePreCheck = [{ count: 0 }];
    const templatesWithTheSlug: never[] = [];
    const templatesAfterTheLostRace = [{ count: 1 }];
    dbMocks.selectChain.limit
      .mockResolvedValueOnce(templatesAtThePreCheck)
      .mockResolvedValueOnce(templatesWithTheSlug)
      .mockResolvedValueOnce(templatesAfterTheLostRace);

    const response = await handleTemplates(apiRequest('templates', 'POST', { title: 'Template', sections }), mockEnv);

    const data = await expectThePersonalLimitReached(response, { limit: 1, current: 1, resource: 'templates' });
    expect(data).not.toHaveProperty('id');
    expect(firstOf(dbMocks.db.batch.mock.calls)[0]).toEqual([{ kind: 'guarded-insert' }, { kind: 'guarded-insert' }, { kind: 'guarded-insert' }]);
  });

  it('MCP start_run answers limit_reached', async () => {
    vi.mocked(authenticatePersonalRunKey).mockResolvedValue({
      keyId: 'key-1',
      userId: 'user-1',
      name: 'Agent',
      permissions: ['templates:read', 'runs:read', 'runs:write'],
    });
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([{ id: 'template-1', user_id: 'user-1', owner_type: 'user', team_id: null, deleted_at: null, title: 'SOP', items: JSON.stringify(sections), content_version: 1 }])
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([{ count: 3 }]);

    const response = await handleAgentMcp(mcpToolCall('start_run', { templateId: 'template-1' }), mockEnv);
    const body = await readJson(response, mcpToolCallResult);

    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent).toEqual(expect.objectContaining({ error: 'limit_reached', details: { limit: 3, current: 3 } }));
  });
});
