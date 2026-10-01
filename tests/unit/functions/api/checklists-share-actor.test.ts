import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dbMocks, EVERY_GUARDED_WRITE_APPLIED, mockEnv, resetToASignedOutVisitorOnTheFreePlan } from '../../../support/apiHandlerMocks';

const guardedInserts = vi.hoisted(() => [] as Array<Record<string, unknown>>);

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
  }), mockEnv);
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
  const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1/history'), mockEnv);
  const text = await response.text();
  expect(response.status).toBe(200);
  return { text, events: (JSON.parse(text) as { events: Array<{ id: string; actor: Record<string, unknown> }> }).events };
}

const hidden = { userId: null, email: null, name: null, username: null };

describe('share-link edits by signed-in visitors', () => {
  beforeEach(() => {
    resetToASignedOutVisitorOnTheFreePlan();
    guardedInserts.length = 0;
    dbMocks.selectChain.orderBy.mockReturnValue(dbMocks.selectChain);
    dbMocks.insertChain.values.mockReturnValue({});
    dbMocks.db.batch.mockResolvedValue(EVERY_GUARDED_WRITE_APPLIED);
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
    resetToASignedOutVisitorOnTheFreePlan();
    dbMocks.selectChain.orderBy.mockReturnValue(dbMocks.selectChain);
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

  it('hides an Organization run\'s share-link actors who are not active members, checking only share-link events', async () => {
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
    expect(events[2].actor).toEqual(expect.objectContaining({ userId: 'former-1' }));
  });

  it('hides a former member only on their share-link events, not on their other edits', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([sharedRun({ team_id: 'team-1' })])
      .mockResolvedValueOnce([member('viewer-9')])
      .mockResolvedValueOnce([
        shareEvent('former-1'),
        { ...shareEvent('former-1', { id: 'audit-archive' }), action: 'checklist_run.archived', metadata_json: null },
        { ...shareEvent('former-1', { id: 'audit-update' }), action: 'checklist_run.updated', metadata_json: '{"source":"web"}' },
      ])
      .mockResolvedValueOnce([]);

    const { events } = await history('viewer-9');

    expect(events[0].actor).toEqual(hidden);
    expect(events[1].actor).toEqual(expect.objectContaining({ userId: 'former-1', email: 'former-1@example.com' }));
    expect(events[2].actor).toEqual(expect.objectContaining({ userId: 'former-1', email: 'former-1@example.com' }));
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
