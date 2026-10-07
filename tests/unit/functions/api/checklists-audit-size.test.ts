import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { firstOf } from '../../../support/elements';
import { dbMocks, mockEnv, PRO_PLAN, resetToASignedInUser } from '../../../support/checklistsHandler';
import { handleChecklists } from '@functions/api/handlers/checklists';
import { apiRequest } from '../../../support/apiRequest';
import { getSessionUserId } from '@functions/api/utils/session';
import { objectContaining } from '../../../support/asymmetricMatchers';
import { jsonRecordIn } from '../../../support/storedJson';

const ROW_BUDGET_BYTES = 300 * 1024;
const encoder = new TextEncoder();

function sections(completedId?: string) {
  return [{
    id: 'section-1',
    title: 'Large SOP',
    items: Array.from({ length: 600 }, (_, index) => ({
      id: `item-${index}`,
      title: `Step ${index}`,
      description: 'Follow the "documented" procedure exactly as written. '.repeat(24),
      isCompleted: `item-${index}` === completedId,
    })),
  }];
}

function largeRun(overrides: Record<string, unknown> = {}) {
  const items = JSON.stringify(sections());
  expect(encoder.encode(items).byteLength).toBeGreaterThan(700_000);
  return {
    id: 'run-1',
    user_id: 'user-123',
    team_id: null,
    template_id: 'template-1',
    title: 'Large run',
    items,
    retired_items: '[]',
    status: 'in_progress',
    template_version: 1,
    revision: 2,
    is_public: false,
    share_token: null,
    ...overrides,
  };
}

const send = (path: string, method: string, body: unknown) =>
  handleChecklists(apiRequest(`checklists/${path}`, method, body), mockEnv);

function expectCompactAudit(toggledId: string) {
  const audit = firstOf(dbMocks.insertChain.values.mock.calls)[0];
  const total = Object.values(audit).reduce<number>(
    (sum, value) => sum + (typeof value === 'string' ? encoder.encode(value).byteLength : 8),
    0,
  );
  expect(total).toBeLessThan(ROW_BUDGET_BYTES);
  for (const column of ['before_json', 'after_json'] as const) {
    const snapshot = jsonRecordIn(audit[column]);
    expect(snapshot).not.toHaveProperty('items');
    expect(snapshot).not.toHaveProperty('retired_items');
    expect(snapshot).not.toHaveProperty('share_token');
  }
  const diff = jsonRecordIn(audit.diff_json);
  expect(diff['items']).toEqual(objectContaining({ completed: [toggledId] }));
}

describe('run audit rows stay small, since an oversized one would fail every save of the run it shares a D1 batch with', () => {
  beforeEach(() => {
    resetToASignedInUser('user-123', PRO_PLAN);
    dbMocks.selectChain.orderBy.mockReturnValue(dbMocks.selectChain);
  });

  it('for a checkbox save on a large private run', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([largeRun()]);

    const response = await send('run-1', 'PUT', { sections: sections('item-7'), status: 'in_progress', expected_revision: 2 });

    expect(response.status).toBe(200);
    expectCompactAudit('item-7');
  });

  it('for a share-link save on a large run', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    dbMocks.selectChain.limit.mockResolvedValueOnce([largeRun({ is_public: true, share_token: 'token-1' })]);

    const response = await send('shared/token-1', 'PUT', { sections: sections('item-9'), expected_revision: 2 });

    expect(response.status).toBe(200);
    expectCompactAudit('item-9');
  });

  it('for revalidating a large run', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([largeRun()])
      .mockResolvedValueOnce([{
        id: 'template-1',
        version: 2,
        items: JSON.stringify(sections()),
        owner_type: 'user',
        team_id: null,
        user_id: 'user-123',
        is_public: false,
      }]);

    const response = await send('run-1/revalidate', 'POST', { expected_revision: 2 });

    expect(response.status).toBe(200);
    const audit = z
      .object({ before_json: z.string(), after_json: z.string(), diff_json: z.string() })
      .passthrough()
      .parse(firstOf(dbMocks.insertChain.values.mock.calls)[0]);
    expect(encoder.encode(audit.before_json + audit.after_json + audit.diff_json).byteLength).toBeLessThan(ROW_BUDGET_BYTES);
    expect(jsonRecordIn(audit.diff_json)['retired_items']).toEqual({ count: 0 });
  });

  it('and history responses never return the full copies that older rows still hold', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([largeRun()])
      .mockResolvedValueOnce([{
        id: 'audit-1',
        action: 'checklist_run.updated',
        diff_json: JSON.stringify({ items: JSON.stringify(sections()), retired_items: '[]', share_token: 'old-token', status: 'completed' }),
        metadata_json: null,
        created_at: '2026-01-01T00:00:00.000Z',
      }]);

    const response = await send('run-1/history', 'GET', undefined);
    const text = await response.text();
    const data = z.object({ events: z.array(z.record(z.unknown())) }).passthrough().parse(JSON.parse(text));

    expect(response.status).toBe(200);
    expect(firstOf(data.events)).not.toHaveProperty('diff');
    expect(text).not.toContain('old-token');
    expect(text).not.toContain('section-1');
  });
});
