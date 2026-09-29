import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import type { SQL } from 'drizzle-orm';

// A guarded UPDATE that matches no row (a lost race) is not an error, so a plain audit INSERT
// in the same batch would still commit and history would show a change that never happened.
// Every run and template write inserts its audit row first, only while the row is still in
// the state the UPDATE requires, and reports a miss instead of success.

type Statement =
  | { kind: 'update'; table: unknown; values: Record<string, unknown>; where: SQL }
  | { kind: 'insert'; table: unknown; values: Record<string, unknown> }
  | { kind: 'insert-select'; table: unknown; query: SQL };

const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  const db = {
    select: vi.fn((_fields?: unknown) => selectChain),
    insert: vi.fn((table: unknown) => ({
      values: (values: Record<string, unknown>) => ({ kind: 'insert', table, values }),
      select: (query: unknown) => ({ kind: 'insert-select', table, query }),
    })),
    update: vi.fn((table: unknown) => ({
      set: (values: Record<string, unknown>) => ({ where: (where: unknown) => ({ kind: 'update', table, values, where }) }),
    })),
    batch: vi.fn(),
  };

  return { selectChain, db };
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

import { schema } from '@functions/api/db';
import { handleChecklists } from '@functions/api/handlers/checklists';
import { handleTemplates } from '@functions/api/handlers/templates';
import { getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';

const env = { DB: {}, BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' } as any;
const dialect = new SQLiteSyncDialect();
const render = (value: SQL) => dialect.sqlToQuery(value).sql;
const items = JSON.stringify([{ id: 'section-1', title: 'S', items: [{ id: 'item-1', title: 'Task', isCompleted: false }] }]);
const missed = () => [{ meta: { changes: 0 } }, { meta: { changes: 0 } }, { meta: { changes: 0 } }, { meta: { changes: 0 } }];

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    user_id: 'user-123',
    team_id: null,
    template_id: 'template-1',
    title: 'Run',
    items,
    retired_items: '[]',
    status: 'in_progress',
    progress: 0,
    template_version: 1,
    revision: 7,
    is_public: false,
    share_token: null,
    deleted_at: null,
    ...overrides,
  };
}

function template(overrides: Record<string, unknown> = {}) {
  return {
    id: 'template-1',
    user_id: 'user-123',
    owner_type: 'user',
    team_id: null,
    title: 'Template',
    description: '',
    items: '[]',
    version: 3,
    content_version: 2,
    is_public: false,
    deleted_at: null,
    ...overrides,
  };
}

async function send(handler: typeof handleChecklists, path: string, method: string, body?: unknown) {
  const response = await handler(new Request(`http://localhost/api/${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

function batchStatements(): Statement[] {
  expect(dbMocks.db.batch).toHaveBeenCalledTimes(1);
  return dbMocks.db.batch.mock.calls[0][0] as Statement[];
}

/** The audit row is an INSERT ... SELECT guarded on `table`'s row, placed before its UPDATE. */
function expectGuardedAudit(table: unknown, guardFragments: string[]) {
  const statements = batchStatements();
  expect(statements.some((statement) => statement.kind === 'insert' && statement.table === schema.audit_events)).toBe(false);
  const auditIndex = statements.findIndex((statement) => statement.kind === 'insert-select' && statement.table === schema.audit_events);
  const updateIndex = statements.findIndex((statement) => statement.kind === 'update' && statement.table === table);
  expect(auditIndex).toBeGreaterThanOrEqual(0);
  expect(updateIndex).toBeGreaterThan(auditIndex);
  const guard = render((statements[auditIndex] as { query: SQL }).query);
  for (const fragment of guardFragments) expect(guard).toContain(fragment);
  return statements;
}

describe('audit rows are written only when the guarded write lands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.limit.mockReset();
    dbMocks.selectChain.orderBy.mockReset();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.leftJoin.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.orderBy.mockResolvedValue([]);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.db.batch.mockResolvedValue(missed());
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForUser).mockResolvedValue({ plan: 'pro', limits: { maxTemplates: null, maxActiveRuns: null } });
  });

  it('run PUT: a lost revision race returns 409', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([run()]);

    const result = await send(handleChecklists, 'checklists/run-1', 'PUT', { status: 'completed', expected_revision: 7 });

    expect(result.status).toBe(409);
    expect(result.body.code).toBe('edit_conflict');
    expectGuardedAudit(schema.checklist_runs, ['"revision" = ?', '"deleted_at" is null', '"user_id" = ?']);
  });

  it('share-link PUT: a lost revision race returns 409', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    // Every task done, so a guest may complete it.
    const done = JSON.stringify([{ id: 'section-1', title: 'S', items: [{ id: 'item-1', title: 'Task', isCompleted: true }] }]);
    dbMocks.selectChain.limit.mockResolvedValueOnce([run({ is_public: true, share_token: 'token-1', items: done })]);

    const result = await send(handleChecklists, 'checklists/shared/token-1', 'PUT', { status: 'completed', expected_revision: 7 });

    expect(result.status).toBe(409);
    expectGuardedAudit(schema.checklist_runs, ['"revision" = ?', '"share_token" = ?', '"is_public" = ?']);
  });

  it('revalidate: a lost revision race returns 409', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([run()])
      .mockResolvedValueOnce([{ id: 'template-1', items, version: 2, is_public: false, owner_type: 'user', team_id: null, user_id: 'user-123' }]);

    const result = await send(handleChecklists, 'checklists/run-1/revalidate', 'POST', { expected_revision: 7 });

    expect(result.status).toBe(409);
    expectGuardedAudit(schema.checklist_runs, ['"revision" = ?', '"deleted_at" is null']);
  });

  it('run archive: a concurrent archive does not report a second success', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([run()]);

    const result = await send(handleChecklists, 'checklists/run-1', 'DELETE');

    expect(result.status).toBe(404);
    expectGuardedAudit(schema.checklist_runs, ['"deleted_at" is null', '"user_id" = ?']);
  });

  it('run restore: a concurrent restore does not report a second success', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([run({ deleted_at: '2026-01-01T00:00:00.000Z' })]);

    const result = await send(handleChecklists, 'checklists/run-1/restore', 'POST');

    expect(result.status).toBe(400);
    expectGuardedAudit(schema.checklist_runs, ['"deleted_at" is not null', '"user_id" = ?']);
  });

  it('run share: a run archived meanwhile is not shared or audited', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([run()]);

    const result = await send(handleChecklists, 'checklists/run/run-1/share', 'POST', {});

    expect(result.status).toBe(404);
    expectGuardedAudit(schema.checklist_runs, ['"deleted_at" is null', '"user_id" = ?']);
  });

  it('template PUT: a lost version race returns 409 and guards the version row and run updates', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([template()]);
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([run()]);

    const result = await send(handleTemplates, 'templates/template-1', 'PUT', {
      expected_version: 3,
      sections: [{ id: 'section-1', title: 'S', items: [{ id: 'item-1', title: 'Renamed' }] }],
    });

    expect(result.status).toBe(409);
    expect(result.body.code).toBe('edit_conflict');
    const statements = expectGuardedAudit(schema.templates, ['"version" = ?', '"deleted_at" is null']);
    const versionInsert = statements.find((statement) => statement.table === schema.template_versions);
    expect(versionInsert?.kind).toBe('insert-select');
    expect(render((versionInsert as { query: SQL }).query)).toContain('"audit_events"');
    const runUpdate = statements.find((statement) => statement.kind === 'update' && statement.table === schema.checklist_runs);
    expect(render((runUpdate as { where: SQL }).where)).toContain('"audit_events"');
  });

  it('template archive: a concurrent archive does not report a second success', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([template()]);

    const result = await send(handleTemplates, 'templates/template-1', 'DELETE');

    expect(result.status).toBe(404);
    expectGuardedAudit(schema.templates, ['"deleted_at" is null', '"user_id" = ?']);
  });

  it('template restore: a concurrent restore does not report a second success', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([template({ deleted_at: '2026-01-01T00:00:00.000Z' })]);

    const result = await send(handleTemplates, 'templates/template-1/restore', 'POST');

    expect(result.status).toBe(400);
    expectGuardedAudit(schema.templates, ['"deleted_at" is not null', '"user_id" = ?']);
  });
});
