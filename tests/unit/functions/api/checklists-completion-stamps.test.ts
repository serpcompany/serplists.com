import { describe, it, expect, beforeEach, vi } from 'vitest';

// The run page sends the run's current status with every save, so a rename, tick or note
// on a completed run arrives as status 'completed' again. Only a real transition into
// completed may stamp completed_at and completed_by_user_id; later saves keep the original
// completer and time. Reopening keeps both stamps too (revalidation is what clears them).

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
    // Guarded inserts go through the plain insert mock so tests can inspect the row.
    insertRowWhere: vi.fn((db: any, table: unknown, values: unknown) => db.insert(table).values(values)),
  };
});

import { handleChecklists } from '@functions/api/handlers/checklists';
import { getEntitlementsForContext, getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';

const env = { DB: {}, BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' } as any;
const pro = { plan: 'pro' as const, limits: { maxTemplates: null, maxActiveRuns: null } };
const membership = { id: 'member-1', team_id: 'team-1', user_id: 'member-b', role: 'runner', status: 'active' };
const sections = [{ id: 'section-1', title: 'S', items: [{ id: 'item-1', title: 'Task', isCompleted: true }] }];
const COMPLETED_AT = '2026-01-01T00:00:00.000Z';

function organizationRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    user_id: 'member-a',
    team_id: 'team-1',
    template_id: 'template-1',
    title: 'Release',
    items: JSON.stringify(sections),
    retired_items: '[]',
    status: 'completed',
    progress: 100,
    completed_at: COMPLETED_AT,
    completed_by_user_id: 'member-a',
    template_version: 1,
    revision: 4,
    is_public: false,
    share_token: null,
    ...overrides,
  };
}

/** Member B saves an Organization run: run lookup, then canViewRun and canUpdateRun memberships. */
function mockOrganizationRun(overrides: Record<string, unknown> = {}) {
  dbMocks.selectChain.limit
    .mockResolvedValueOnce([organizationRun(overrides)])
    .mockResolvedValueOnce([membership])
    .mockResolvedValueOnce([membership]);
}

async function put(body: Record<string, unknown>) {
  const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1', {
    method: 'PUT',
    body: JSON.stringify({ expected_revision: 4, ...body }),
  }), env);
  return { response, data: await response.json() as Record<string, unknown> };
}

function savedUpdates(): Record<string, unknown> {
  expect(dbMocks.updateChain.set).toHaveBeenCalledOnce();
  return dbMocks.updateChain.set.mock.calls[0][0];
}

function auditDiff(): Record<string, unknown> {
  const auditRow = dbMocks.insertChain.values.mock.calls
    .map(([row]) => row as Record<string, unknown>)
    .find((row) => typeof row.diff_json === 'string');
  expect(auditRow).toBeDefined();
  return JSON.parse(auditRow!.diff_json as string);
}

describe('run completion stamps on PUT /api/checklists/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.limit.mockReset();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.leftJoin.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockResolvedValue(undefined);
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.where.mockReturnValue(dbMocks.updateChain);
    dbMocks.db.batch.mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    vi.mocked(getSessionUserId).mockResolvedValue('member-b');
    vi.mocked(getEntitlementsForUser).mockResolvedValue(pro);
    vi.mocked(getEntitlementsForContext).mockResolvedValue(pro);
  });

  it('keeps the original completer and time when another member renames a completed run', async () => {
    mockOrganizationRun();

    const { response } = await put({
      title: 'Renamed',
      status: 'completed',
      progress: 100,
      completed_at: COMPLETED_AT,
      sections,
    });

    expect(response.status).toBe(200);
    const updates = savedUpdates();
    expect(updates).toEqual(expect.objectContaining({ title: 'Renamed', status: 'completed' }));
    expect(updates).not.toHaveProperty('completed_by_user_id');
    expect(updates).not.toHaveProperty('completed_at');
    expect(auditDiff()).not.toHaveProperty('completed_by_user_id');
  });

  it('ignores a different completed_at sent for a run that is already completed', async () => {
    mockOrganizationRun();

    await put({ status: 'completed', completed_at: '2026-05-05T00:00:00.000Z', sections });

    const updates = savedUpdates();
    expect(updates).not.toHaveProperty('completed_at');
    expect(updates).not.toHaveProperty('completed_by_user_id');
  });

  it('dates a legacy completed run once, then leaves the date alone', async () => {
    mockOrganizationRun({ completed_at: null });
    await put({ status: 'completed', title: 'Renamed' });

    const first = savedUpdates();
    expect(typeof first.completed_at).toBe('string');
    expect(first).not.toHaveProperty('completed_by_user_id');

    vi.clearAllMocks();
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.where.mockReturnValue(dbMocks.updateChain);
    // The client still holds no completedAt (null maps to undefined), so the key is absent again.
    mockOrganizationRun({ completed_at: first.completed_at, revision: 4 });
    await put({ status: 'completed', title: 'Renamed again' });

    expect(savedUpdates()).not.toHaveProperty('completed_at');
  });

  it('stamps the completer and time when the run becomes completed', async () => {
    mockOrganizationRun({ status: 'in_progress', completed_at: null, completed_by_user_id: null });
    const before = Date.now();

    await put({ status: 'completed', sections });

    const updates = savedUpdates();
    expect(updates.completed_by_user_id).toBe('member-b');
    expect(Date.parse(updates.completed_at as string)).toBeGreaterThanOrEqual(before - 1000);
    expect(auditDiff()).toEqual(expect.objectContaining({ completed_by_user_id: 'member-b' }));
  });

  it('keeps the completion time the client sends when the run becomes completed', async () => {
    mockOrganizationRun({ status: 'in_progress', completed_at: null, completed_by_user_id: null });

    await put({ status: 'completed', completed_at: '2026-02-02T10:00:00.000Z' });

    expect(savedUpdates()).toEqual(expect.objectContaining({
      completed_at: '2026-02-02T10:00:00.000Z',
      completed_by_user_id: 'member-b',
    }));
  });

  it('never completes a run with a null completion time', async () => {
    mockOrganizationRun({ status: 'in_progress', completed_at: null, completed_by_user_id: null });

    await put({ status: 'completed', completed_at: null });

    expect(typeof savedUpdates().completed_at).toBe('string');
  });

  it('keeps the completion stamps when a completed run is reopened', async () => {
    mockOrganizationRun();

    await put({ status: 'in_progress', completed_at: COMPLETED_AT });

    const updates = savedUpdates();
    expect(updates.status).toBe('in_progress');
    expect(updates).not.toHaveProperty('completed_at');
    expect(updates).not.toHaveProperty('completed_by_user_id');
  });

  it('ignores completed_at on saves of a run that is in progress', async () => {
    mockOrganizationRun({ status: 'in_progress', completed_at: COMPLETED_AT });

    await put({ status: 'in_progress', completed_at: '2026-05-05T00:00:00.000Z', sections });

    expect(savedUpdates()).not.toHaveProperty('completed_at');
  });
});

describe('run completion stamps on POST /api/checklists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.limit.mockReset();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockResolvedValue(undefined);
    dbMocks.db.batch.mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    vi.mocked(getSessionUserId).mockResolvedValue('member-b');
    vi.mocked(getEntitlementsForUser).mockResolvedValue(pro);
  });

  it('stamps a run created as completed', async () => {
    const response = await handleChecklists(new Request('http://localhost/api/checklists', {
      method: 'POST',
      body: JSON.stringify({ title: 'Done already', sections, status: 'completed' }),
    }), env);

    expect(response.status).toBe(200);
    const inserted = dbMocks.insertChain.values.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted.status).toBe('completed');
    expect(inserted.completed_by_user_id).toBe('member-b');
    expect(typeof inserted.completed_at).toBe('string');
  });
});
