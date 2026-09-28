import { describe, it, expect, beforeEach, vi } from 'vitest';

// Share-link visitors are guests. A visitor who happens to be signed in must not be named
// (with their email) in the run owner's history: the edit is attributed only when the
// visitor already belongs to the run's owner context.

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
    select: vi.fn((_fields?: unknown) => selectChain),
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
    batch: vi.fn(),
  };

  return { selectChain, insertChain, updateChain, db };
});

const guardedInserts = vi.hoisted(() => [] as Array<Record<string, unknown>>);

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
    insertRowWhere: vi.fn((_db: unknown, _table: unknown, values: Record<string, unknown>) => {
      guardedInserts.push(values);
      return {};
    }),
  };
});

import { handleChecklists } from '@functions/api/handlers/checklists';
import { getSessionUserId } from '@functions/api/utils/session';

const env = { DB: {}, BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' } as any;
const items = JSON.stringify([{ id: 'section-1', title: 'S', items: [{ id: 'item-1', title: 'Task', isCompleted: false }] }]);

function sharedRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    user_id: 'owner-123',
    team_id: null,
    template_id: null,
    title: 'Shared run',
    items,
    retired_items: '[]',
    status: 'in_progress',
    progress: 0,
    revision: 2,
    is_public: true,
    share_token: 'token-1',
    deleted_at: null,
    ...overrides,
  };
}

const member = (userId: string, role = 'viewer') => ({ id: `m-${userId}`, team_id: 'team-1', user_id: userId, role, status: 'active' });

async function guestTicksTask(sessionUserId: string | null) {
  vi.mocked(getSessionUserId).mockResolvedValue(sessionUserId);
  const sections = JSON.parse(items);
  sections[0].items[0].isCompleted = true;
  const response = await handleChecklists(new Request('http://localhost/api/checklists/shared/token-1', {
    method: 'PUT',
    body: JSON.stringify({ sections, expected_revision: 2 }),
  }), env);
  expect(response.status).toBe(200);
  const audits = [...dbMocks.insertChain.values.mock.calls.map(([values]) => values), ...guardedInserts]
    .filter((values) => values.action === 'checklist_run.shared_updated');
  expect(audits).toHaveLength(1);
  return audits[0] as Record<string, unknown>;
}

function shareEvent(actorUserId: string | null, extra: Record<string, unknown> = {}) {
  return {
    id: `audit-${actorUserId}`,
    actor_user_id: actorUserId,
    action: 'checklist_run.shared_updated',
    diff_json: '{"status":"in_progress"}',
    metadata_json: '{"source":"public_share"}',
    created_at: '2026-01-01T00:00:00.000Z',
    actor_email: actorUserId ? `${actorUserId}@example.com` : null,
    actor_name: actorUserId ? `Name ${actorUserId}` : null,
    actor_username: actorUserId,
    ...extra,
  };
}

async function history(sessionUserId: string) {
  vi.mocked(getSessionUserId).mockResolvedValue(sessionUserId);
  const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1/history'), env);
  const text = await response.text();
  expect(response.status).toBe(200);
  return { text, events: (JSON.parse(text) as { events: Array<{ id: string; actor: Record<string, unknown> }> }).events };
}

const hidden = { userId: null, email: null, name: null, username: null };

describe('share-link edits by signed-in visitors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guardedInserts.length = 0;
    dbMocks.selectChain.limit.mockReset();
    dbMocks.selectChain.orderBy.mockReset();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.leftJoin.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.orderBy.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockReturnValue({});
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.where.mockReturnValue(dbMocks.updateChain);
    dbMocks.db.batch.mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
  });

  it('record no actor for a signed-in outsider on a Personal run', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);

    const audit = await guestTicksTask('visitor-1');

    expect(audit.actor_user_id).toBeNull();
    expect(audit.metadata_json).toContain('public_share');
  });

  it('record the owner who edits through their own link', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);

    expect((await guestTicksTask('owner-123')).actor_user_id).toBe('owner-123');
  });

  it('record an active member of the run\'s Organization', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([sharedRun({ team_id: 'team-1' })])
      .mockResolvedValueOnce([member('member-1')]);

    expect((await guestTicksTask('member-1')).actor_user_id).toBe('member-1');
  });

  it('record no actor for a signed-in visitor outside the run\'s Organization', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([sharedRun({ team_id: 'team-1' })])
      .mockResolvedValueOnce([]);

    expect((await guestTicksTask('visitor-1')).actor_user_id).toBeNull();
  });

  it('record no actor for an anonymous guest, without a membership lookup', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun({ team_id: 'team-1' })]);

    expect((await guestTicksTask(null)).actor_user_id).toBeNull();
    expect(dbMocks.selectChain.limit).toHaveBeenCalledTimes(1);
  });
});

describe('run history of share-link edits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.limit.mockReset();
    dbMocks.selectChain.orderBy.mockReset();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.leftJoin.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.orderBy.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.limit.mockResolvedValue([]);
  });

  it('hides an outsider recorded on a Personal run by older rows', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([sharedRun()])
      .mockResolvedValueOnce([shareEvent('visitor-1'), shareEvent('owner-123')]);

    const { text, events } = await history('owner-123');

    expect(events[0].actor).toEqual(hidden);
    expect(text).not.toContain('visitor-1@example.com');
    expect(text).not.toContain('Name visitor-1');
    expect(events[1].actor).toEqual(expect.objectContaining({ userId: 'owner-123', email: 'owner-123@example.com' }));
  });

  it('hides an Organization run\'s share-link actors who are not active members', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([sharedRun({ team_id: 'team-1' })])
      .mockResolvedValueOnce([member('viewer-9')])
      .mockResolvedValueOnce([
        shareEvent('visitor-1'),
        shareEvent('member-1'),
        { ...shareEvent('former-1'), action: 'checklist_run.updated', metadata_json: null },
      ])
      .mockResolvedValueOnce([{ user_id: 'member-1' }]);

    const { text, events } = await history('viewer-9');

    expect(events[0].actor).toEqual(hidden);
    expect(text).not.toContain('visitor-1@example.com');
    expect(events[1].actor).toEqual(expect.objectContaining({ userId: 'member-1' }));
    // Only share-link events are checked; a member's own edits keep their name.
    expect(events[2].actor).toEqual(expect.objectContaining({ userId: 'former-1' }));
  });

  it('skips the membership lookup when no share-link event names anyone', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([sharedRun({ team_id: 'team-1' })])
      .mockResolvedValueOnce([member('viewer-9')])
      .mockResolvedValueOnce([shareEvent(null)]);

    const { events } = await history('viewer-9');

    expect(events[0].actor).toEqual(hidden);
    expect(dbMocks.selectChain.limit).toHaveBeenCalledTimes(3);
  });
});
