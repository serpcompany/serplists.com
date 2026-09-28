import { describe, it, expect, beforeEach, vi } from 'vitest';

// Run saves must write a small audit row even for a large run: D1 rejects rows over
// 2,000,000 bytes, and the audit insert shares a batch with the save, so an oversized row
// would fail every save of that run.

const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  const insertChain = { values: vi.fn() };
  const updateChain = { set: vi.fn(), where: vi.fn() };
  const db = {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
    batch: vi.fn(),
  };

  return { selectChain, insertChain, updateChain, db };
});

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => dbMocks.db),
}));

vi.mock('@functions/api/utils/session', () => ({
  getSessionUserId: vi.fn(),
}));

vi.mock('@functions/api/utils/entitlements', () => ({
  getEntitlementsForUser: vi.fn(),
  getEntitlementsForContext: vi.fn(),
}));

vi.mock('@functions/api/utils/guarded-insert', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@functions/api/utils/guarded-insert')>();
  return {
    ...actual,
    // Guarded audit inserts go through the plain insert mock so tests can inspect the row;
    // the guards themselves are covered in audit-guards.test.ts and the local D1 tests.
    insertRowWhere: vi.fn((db: any, table: unknown, values: unknown) => db.insert(table).values(values)),
  };
});

import { handleChecklists } from '@functions/api/handlers/checklists';
import { getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';

const env = { DB: {}, BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' } as any;
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

async function send(path: string, method: string, body: unknown) {
  const response = await handleChecklists(new Request(`http://localhost/api/checklists/${path}`, {
    method,
    body: JSON.stringify(body),
  }), env);
  return response;
}

function expectCompactAudit(toggledId: string) {
  const audit = dbMocks.insertChain.values.mock.calls[0][0] as Record<string, unknown>;
  const total = Object.values(audit).reduce<number>(
    (sum, value) => sum + (typeof value === 'string' ? encoder.encode(value).byteLength : 8),
    0,
  );
  expect(total).toBeLessThan(ROW_BUDGET_BYTES);
  for (const column of ['before_json', 'after_json'] as const) {
    const snapshot = JSON.parse(audit[column] as string);
    expect(snapshot).not.toHaveProperty('items');
    expect(snapshot).not.toHaveProperty('retired_items');
    expect(snapshot).not.toHaveProperty('share_token');
  }
  const diff = JSON.parse(audit.diff_json as string);
  expect(diff.items).toEqual(expect.objectContaining({ completed: [toggledId] }));
}

describe('run audit rows stay small', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.limit.mockReset();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.leftJoin.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.orderBy.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockResolvedValue(undefined);
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.where.mockReturnValue(dbMocks.updateChain);
    dbMocks.db.batch.mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForUser).mockResolvedValue({ plan: 'pro', limits: { maxTemplates: null, maxActiveRuns: null } });
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
    const audit = dbMocks.insertChain.values.mock.calls[0][0] as Record<string, string>;
    expect(encoder.encode(audit.before_json + audit.after_json + audit.diff_json).byteLength).toBeLessThan(ROW_BUDGET_BYTES);
    expect(JSON.parse(audit.diff_json).retired_items).toEqual({ count: 0 });
  });

  it('and history responses drop the full copies that older rows still hold', async () => {
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
    const data = await response.json() as { events: Array<{ diff: Record<string, unknown> }> };

    expect(response.status).toBe(200);
    expect(data.events[0].diff).toEqual({
      items: { omitted: true },
      retired_items: { omitted: true },
      share_token: '[redacted]',
      status: 'completed',
    });
  });
});
