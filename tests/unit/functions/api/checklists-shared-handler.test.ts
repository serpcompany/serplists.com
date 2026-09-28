import { describe, it, expect, beforeEach, vi } from 'vitest';

// PUT /api/checklists/shared/:token needs no login, so a share-link guest may change only
// completion state and task notes. The stored run structure is never taken from the payload.

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

import { handleChecklists } from '@functions/api/handlers/checklists';
import { getSessionUserId } from '@functions/api/utils/session';

const storedSections = [
  {
    id: 'section-1',
    title: 'Launch',
    items: [
      {
        id: 'item-1',
        title: 'Write the brief',
        description: 'Owner instructions',
        isCompleted: false,
        contents: [
          { id: 'content-1', type: 'text', value: 'Read the style guide first.' },
          {
            id: 'content-2',
            type: 'subItems',
            value: '',
            subItems: [
              { id: 'sub-1', title: 'Outline', isCompleted: false },
              { id: 'sub-2', title: 'Draft', isCompleted: false },
            ],
          },
        ],
      },
      { id: 'item-2', title: 'Publish', isCompleted: false },
    ],
  },
];

function sharedRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'shared-run',
    template_id: 'template-2',
    title: 'Shared Run',
    status: 'in_progress',
    progress: 0,
    items: JSON.stringify(storedSections),
    retired_items: '[]',
    started_at: '2026-01-01T00:00:00.000Z',
    completed_at: null,
    user_id: 'owner-123',
    team_id: null,
    share_token: 'shared-run',
    is_public: true,
    revision: 3,
    ...overrides,
  };
}

// What the share page sends: the full sections it rendered, plus client-computed fields.
function clientSections() {
  return JSON.parse(JSON.stringify(storedSections)) as typeof storedSections;
}

async function putShared(body: unknown) {
  const response = await handleChecklists(new Request('http://localhost/api/checklists/shared/shared-run', {
    method: 'PUT',
    body: JSON.stringify(body),
  }), { DB: {}, BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' } as any);
  return { response, data: await response.json() as Record<string, unknown> };
}

function storedUpdate(): Record<string, unknown> {
  expect(dbMocks.updateChain.set).toHaveBeenCalledTimes(1);
  return dbMocks.updateChain.set.mock.calls[0][0];
}

function stripGuestState(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripGuestState);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'isCompleted' && key !== 'notes')
      .map(([key, entry]) => [key, stripGuestState(entry)]),
  );
}

describe('shared run updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Drop queued lookups a test left unused (for example after an early 400).
    dbMocks.selectChain.limit.mockReset();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockResolvedValue(undefined);
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.where.mockReturnValue(dbMocks.updateChain);
    dbMocks.db.batch.mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    vi.mocked(getSessionUserId).mockResolvedValue(null);
  });

  it('keeps the stored tasks when a guest sends an empty sections list', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);

    const { response } = await putShared({ sections: [], expected_revision: 3 });

    expect(response.status).toBe(200);
    expect(JSON.parse(storedUpdate().items as string)).toEqual(storedSections);
  });

  it('keeps the stored tasks when a guest sends a section with no items', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);

    const { response } = await putShared({
      sections: [{ id: 'section-1', title: 'Checklist', items: [] }],
      expected_revision: 3,
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(storedUpdate().items as string)).toEqual(storedSections);
  });

  it('applies only completion from a payload that also rewrites titles, contents, and adds tasks', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);
    const sections = clientSections();
    sections[0].title = 'Hacked section';
    sections[0].items[0].title = 'Log in here';
    sections[0].items[0].description = 'Visit https://attacker.example';
    sections[0].items[0].isCompleted = true;
    sections[0].items[0].contents[0].value = '[Log in](https://attacker.example)';
    (sections[0].items[0].contents as unknown[]).push({ type: 'file', value: 'https://attacker.example/x.exe' });
    (sections[0].items as unknown[]).push({ id: 'item-99', title: 'Injected', isCompleted: true });
    (sections as unknown[]).push({ id: 'section-99', title: 'Injected', items: [{ id: 'item-98', title: 'Injected' }] });

    const { response } = await putShared({ sections, title: 'Renamed run', expected_revision: 3 });

    expect(response.status).toBe(200);
    const update = storedUpdate();
    expect(update).not.toHaveProperty('title');
    const saved = JSON.parse(update.items as string);
    expect(stripGuestState(saved)).toEqual(stripGuestState(storedSections));
    expect(saved[0].items[0].isCompleted).toBe(true);
    expect(saved[0].items[1].isCompleted).toBe(false);
    expect(JSON.stringify(saved)).not.toContain('attacker.example');
  });

  it('stores server-computed progress and ignores client progress and completed_at', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);

    const { response, data } = await putShared({
      sections: clientSections(),
      progress: 100,
      completed_at: '2020-01-01T00:00:00.000Z',
      expected_revision: 3,
    });

    expect(response.status).toBe(200);
    const update = storedUpdate();
    expect(update.progress).toBe(0);
    expect(update).not.toHaveProperty('completed_at');
    expect(data.progress).toBe(0);
  });

  it('sets completed_at on the server when a guest completes the run', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);
    const sections = clientSections();
    sections[0].items[1].isCompleted = true;

    const { response } = await putShared({
      sections,
      status: 'completed',
      completed_at: '2020-01-01T00:00:00.000Z',
      expected_revision: 3,
    });

    expect(response.status).toBe(200);
    const update = storedUpdate();
    expect(update.status).toBe('completed');
    expect(update.completed_at).not.toBe('2020-01-01T00:00:00.000Z');
    expect(typeof update.completed_at).toBe('string');
    expect(typeof update.share_used_at).toBe('string');
    // item-1 (and its two sub-items) are still open: 1 of 4 units done.
    expect(update.progress).toBe(25);
  });

  it('requires expected_revision', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);

    const { response } = await putShared({ sections: clientSections() });

    expect(response.status).toBe(400);
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });

  it('rejects oversized notes', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);
    const sections = clientSections();
    (sections[0].items[0] as Record<string, unknown>).notes = 'x'.repeat(5001);

    const { response } = await putShared({ sections, expected_revision: 3 });

    expect(response.status).toBe(400);
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });

  it('saves guest notes and sub-item completion matched by id', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);
    const sections = clientSections();
    (sections[0].items[0] as Record<string, unknown>).notes = 'Guest note';
    sections[0].items[0].contents[1].subItems!.reverse();
    sections[0].items[0].contents[1].subItems![0].isCompleted = true; // sub-2 after the reverse

    const { response } = await putShared({ sections, expected_revision: 3 });

    expect(response.status).toBe(200);
    const saved = JSON.parse(storedUpdate().items as string);
    expect(saved[0].items[0].notes).toBe('Guest note');
    expect(saved[0].items[0].contents[1].subItems).toEqual([
      expect.objectContaining({ id: 'sub-1', isCompleted: false }),
      expect.objectContaining({ id: 'sub-2', isCompleted: true }),
    ]);
    expect(storedUpdate().progress).toBe(25);
  });

  it('matches a legacy flat run without ids by the ids the share page assigns', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun({
      items: JSON.stringify([{ title: 'First' }, { title: 'Second' }]),
    })]);

    const { response } = await putShared({
      sections: [{
        id: '1',
        title: 'Checklist',
        items: [
          { id: '1-1', title: 'First', isCompleted: false },
          { id: '1-2', title: 'Renamed', isCompleted: true },
        ],
      }],
      expected_revision: 3,
    });

    expect(response.status).toBe(200);
    const saved = JSON.parse(storedUpdate().items as string);
    expect(saved[0].items).toEqual([
      { title: 'First', isCompleted: false },
      { title: 'Second', isCompleted: true },
    ]);
  });

  it('records the merged state, not the raw payload, in the audit event', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);
    const sections = clientSections();
    sections[0].items[0].title = 'Log in here';

    await putShared({ sections, expected_revision: 3 });

    const audit = dbMocks.insertChain.values.mock.calls[0][0];
    expect(audit.action).toBe('checklist_run.shared_updated');
    expect(audit.diff_json).not.toContain('Log in here');
  });
});
