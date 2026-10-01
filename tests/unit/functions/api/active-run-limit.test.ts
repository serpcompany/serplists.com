import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';

const dbMocks = vi.hoisted(() => {
  const selectChain = { from: vi.fn(), where: vi.fn(), limit: vi.fn() };
  return { selectChain, db: { select: vi.fn(() => selectChain) } };
});

vi.mock('drizzle-orm/d1', () => ({ drizzle: vi.fn(() => dbMocks.db) }));
vi.mock('@functions/api/utils/entitlements', () => ({
  getEntitlementsForUser: vi.fn(),
  getEntitlementsForContext: vi.fn(),
}));

import { schema } from '@functions/api/db';
import {
  activeRunsInContext,
  findActiveRunLimitHit,
  isReopening,
  runInsertStatements,
} from '@functions/api/utils/active-run-limit';
import { getEntitlementsForContext, getEntitlementsForUser } from '@functions/api/utils/entitlements';

const env = { DB: {} } as any;
const free = { plan: 'free' as const, limits: { maxTemplates: 1, maxActiveRuns: 3 } };

describe('isReopening', () => {
  it.each([
    ['completed', 'in_progress', true],
    [null, 'in_progress', true],
    ['in_progress', 'in_progress', false],
    ['completed', 'completed', false],
    ['in_progress', 'completed', false],
    ['completed', undefined, false],
  ])('%s -> %s is %s', (current, next, expected) => {
    expect(isReopening(current, next)).toBe(expected);
  });
});

describe('findActiveRunLimitHit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.limit.mockReset();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    vi.mocked(getEntitlementsForUser).mockResolvedValue(free);
    vi.mocked(getEntitlementsForContext).mockResolvedValue(free);
  });

  it('reports the limit when a Free Personal context is full', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ count: 3 }]);
    expect(await findActiveRunLimitHit(env, { userId: 'owner', teamId: null }, 'actor')).toEqual({ limit: 3, current: 3 });
    expect(getEntitlementsForUser).toHaveBeenCalledWith(env, 'owner');
  });

  it('allows one more run below the limit', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ count: 2 }]);
    expect(await findActiveRunLimitHit(env, { userId: 'owner', teamId: null })).toBeNull();
  });

  it('uses the Organization plan for Organization runs', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ count: 5 }]);
    expect(await findActiveRunLimitHit(env, { userId: 'owner', teamId: 'org-1' }, 'actor')).toEqual({ limit: 3, current: 5 });
    expect(getEntitlementsForContext).toHaveBeenCalledWith(env, { type: 'team', teamId: 'org-1', userId: 'actor' });
    expect(getEntitlementsForUser).not.toHaveBeenCalled();
  });

  it('skips the count on plans without a limit', async () => {
    vi.mocked(getEntitlementsForUser).mockResolvedValue({ plan: 'pro', limits: { maxTemplates: null, maxActiveRuns: null } });
    expect(await findActiveRunLimitHit(env, { userId: 'owner', teamId: null })).toBeNull();
    expect(dbMocks.db.select).not.toHaveBeenCalled();
  });
});

describe('activeRunsInContext', () => {
  const render = (owner: { userId: string; teamId: string | null }) =>
    new SQLiteSyncDialect().sqlToQuery(activeRunsInContext(owner));

  it('counts an Organization\'s in-progress runs by Organization only', () => {
    const query = render({ userId: 'owner', teamId: 'org-1' });
    expect(query.sql).not.toContain('"user_id"');
    expect(query.params).toEqual(['org-1', 'in_progress']);
  });

  it('counts a Personal context by owner outside any Organization', () => {
    const query = render({ userId: 'owner', teamId: null });
    expect(query.sql).toContain('"team_id" is null');
    expect(query.params).toEqual(['owner', 'in_progress']);
  });

  it('counts shared runs like any other active run', () => {
    for (const teamId of ['org-1', null]) {
      expect(render({ userId: 'owner', teamId }).sql).not.toContain('is_public');
    }
  });
});

describe('the active-run limit has one implementation', () => {
  it('reads maxActiveRuns only in active-run-limit.ts, since a route that counted its own way left shared runs out of the count', () => {
    const root = path.resolve(__dirname, '../../../../functions');
    const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? sources(path.join(dir, entry.name)) : entry.name.endsWith('.ts') ? [path.join(dir, entry.name)] : []);
    const readers = sources(root)
      .filter((file) => /limits\.maxActiveRuns/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(root, file).split(path.sep).join('/'));

    expect(readers).toEqual(['api/utils/active-run-limit.ts']);
  });
});

describe('runInsertStatements with a limit', () => {
  async function realDrizzleWithoutD1() {
    const { drizzle } = await vi.importActual<typeof import('drizzle-orm/d1')>('drizzle-orm/d1');
    return drizzle({} as D1Database, { schema });
  }

  function insertedColumns(sqlText: string): string[] {
    const list = /^insert into "\w+" \(([^)]*)\)/.exec(sqlText)?.[1] ?? '';
    return list.split(',').map((column) => column.trim().replace(/"/g, ''));
  }

  function selectedValues(sqlText: string): string[] {
    return (/select\s+(.*?)\s+where (?:\(|exists)/s.exec(sqlText)?.[1] ?? '').split(', ');
  }

  function providedValuesInColumnOrder(columns: string[], values: Record<string, unknown>): unknown[] {
    return columns.filter((column) => column in values).map((column) => values[column]);
  }

  const run = {
    id: 'run-1',
    user_id: 'user-1',
    team_id: null,
    template_id: 'template-1',
    title: 'Release SOP',
    items: '[]',
    status: 'in_progress',
    progress: 0,
    started_at: '2026-09-28T00:00:00.000Z',
    completed_at: null,
    created_by_user_id: 'user-1',
    started_by_user_id: 'user-1',
    created_at: '2026-09-28T00:00:00.000Z',
    updated_at: '2026-09-28T00:00:00.000Z',
    template_version: 4,
    revision: 1,
    retired_items: '[]',
  };

  const auditEvent = {
    id: 'audit-1',
    actor_user_id: 'user-1',
    subject_type: 'user',
    subject_id: 'user-1',
    resource_type: 'checklist_run',
    resource_id: 'run-1',
    action: 'checklist_run.created',
    after_json: '{}',
    metadata_json: '{}',
    created_at: '2026-09-28T00:00:00.000Z',
  };

  it('selects one value per inserted column, in column order, then applies the limit', async () => {
    const db = await realDrizzleWithoutD1();
    const [runInsert] = runInsertStatements(db as never, run, auditEvent, { userId: 'user-1', teamId: null }, 3);
    const query = runInsert.toSQL();
    const columns = insertedColumns(query.sql);

    expect(columns).toEqual(Object.values(getTableColumns(schema.checklist_runs)).map((column) => column.name));
    expect(selectedValues(query.sql)).toHaveLength(columns.length);
    const valueParams = query.params.slice(0, -3);
    const limitGuardParams = query.params.slice(-3);
    expect(valueParams).toEqual(providedValuesInColumnOrder(columns, run));
    expect(limitGuardParams).toEqual(['user-1', 'in_progress', 3]);
    expect(query.sql).toMatch(/where \(select count\(\*\) from "checklist_runs" where .*"deleted_at" is null\)\) < \?$/s);
  });

  it('writes the audit event only when its run row exists', async () => {
    const db = await realDrizzleWithoutD1();
    const [, auditInsert] = runInsertStatements(db as never, run, auditEvent, { userId: 'user-1', teamId: null }, 3);
    const query = auditInsert.toSQL();

    const columns = insertedColumns(query.sql);
    expect(columns).toEqual(Object.values(getTableColumns(schema.audit_events)).map((column) => column.name));
    expect(selectedValues(query.sql)).toHaveLength(columns.length);
    expect(query.params).toEqual([...providedValuesInColumnOrder(columns, auditEvent), 'run-1']);
    expect(query.sql).toMatch(/where exists \(select 1 from "checklist_runs" where "checklist_runs"\."id" = \?\)$/s);
  });
});
