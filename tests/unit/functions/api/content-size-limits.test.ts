import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chainSelectsUpdatesAndDeletes } from '../../../support/drizzleChainMocks';

const dbMocks = await vi.hoisted(async () => (await import('../../../support/drizzleChainMocks')).drizzleChainMocks());

vi.mock('drizzle-orm/d1', () => ({ drizzle: vi.fn(() => dbMocks.db) }));
vi.mock('@functions/api/utils/session', () => ({ getSessionUserId: vi.fn() }));
vi.mock('@functions/api/utils/entitlements', () => ({
  getEntitlementsForUser: vi.fn(),
  getEntitlementsForContext: vi.fn(),
}));

import { handleChecklists } from '@functions/api/handlers/checklists';
import { handleTemplates } from '@functions/api/handlers/templates';
import { getEntitlementsForContext, getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';
import { contentSaveBytes, RUN_CONTENT_MAX_BYTES, TEMPLATE_CONTENT_MAX_BYTES } from '@/lib/schemas/contentLimits';

type Task = Record<string, unknown>;

const sectionsWithText = (length: number, task: Task = {}, extraTasks: Task[] = []) => [
  {
    id: 'section-1',
    title: 'Guide',
    items: [
      { id: 'item-1', title: 'Read', description: '', contents: [{ id: 'content-1', type: 'text', value: 'x'.repeat(length) }], ...task },
      ...extraTasks,
    ],
  },
];

const sectionsMeasuringExactly = (bytes: number, task: Task = {}, extraTasks: Task[] = []) =>
  sectionsWithText(bytes - contentSaveBytes(sectionsWithText(0, task, extraTasks)), task, extraTasks);

const runWithNotesFillingItTo = (bytes: number, templateBytes: number, task: Task = {}) => {
  const template = sectionsMeasuringExactly(templateBytes);
  const withNotes = (notes: string) => [{
    ...template[0],
    items: template[0].items.map((item) => ({ ...item, isCompleted: false, ...task, ...(item.id === 'item-1' ? { notes } : {}) })),
  }];
  return withNotes('n'.repeat(bytes - contentSaveBytes(withNotes(''))));
};

const env = { DB: {}, BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' } as never;

const expectTooLarge = async (response: Response) => {
  expect(response.status).toBe(413);
  expect(await response.json()).toEqual(expect.objectContaining({ code: 'content_too_large' }));
  expect(dbMocks.db.batch).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.clearAllMocks();
  chainSelectsUpdatesAndDeletes(dbMocks);
  dbMocks.selectChain.orderBy.mockResolvedValue([]);
  dbMocks.selectChain.limit.mockResolvedValue([]);
  dbMocks.insertChain.values.mockResolvedValue(undefined);
  dbMocks.insertChain.select.mockReturnValue({ kind: 'conditional-insert' });
  dbMocks.db.batch.mockResolvedValue([]);
  vi.mocked(getSessionUserId).mockResolvedValue('user-123');
  const pro = { plan: 'pro', limits: { maxTemplates: null, maxActiveRuns: null } };
  vi.mocked(getEntitlementsForUser).mockResolvedValue(pro as never);
  vi.mocked(getEntitlementsForContext).mockResolvedValue(pro as never);
});

describe('Template content limit', () => {
  const storedTemplate = (sections: unknown) => ({
    id: 'template-1',
    user_id: 'user-123',
    owner_type: 'user',
    team_id: null,
    title: 'Guide',
    description: '',
    type: 'checklist',
    seo_title: '',
    seo_description: '',
    items: JSON.stringify(sections),
    category: '[]',
    tags: '[]',
    slug: 'guide',
    version: 1,
    content_version: 1,
    is_public: false,
  });
  const post = (sections: unknown) => handleTemplates(new Request('http://localhost/api/templates', {
    method: 'POST',
    body: JSON.stringify({ title: 'Guide', sections }),
  }), env);
  const put = (sections: unknown) => handleTemplates(new Request('http://localhost/api/templates/template-1', {
    method: 'PUT',
    body: JSON.stringify({ sections, expected_version: 1 }),
  }), env);

  it('creates a template at the limit and refuses one over it', async () => {
    await expectTooLarge(await post(sectionsMeasuringExactly(TEMPLATE_CONTENT_MAX_BYTES + 1)));

    const response = await post(sectionsMeasuringExactly(TEMPLATE_CONTENT_MAX_BYTES));
    expect(response.status).toBe(200);
    expect(dbMocks.db.batch).toHaveBeenCalledTimes(1);
  });

  it('refuses a save that grows the content past the limit', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([storedTemplate(sectionsMeasuringExactly(1000))]);

    await expectTooLarge(await put(sectionsMeasuringExactly(TEMPLATE_CONTENT_MAX_BYTES + 1)));
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
  });

  it('saves a template stored over the limit before it existed, when the save does not grow it', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([storedTemplate(sectionsMeasuringExactly(TEMPLATE_CONTENT_MAX_BYTES + 5000))]);

    const response = await put(sectionsMeasuringExactly(TEMPLATE_CONTENT_MAX_BYTES + 4000));

    expect(response.status).toBe(200);
    expect(dbMocks.db.batch).toHaveBeenCalledTimes(1);
  });

  it('refuses to copy a public template stored over the limit', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { ...storedTemplate(sectionsMeasuringExactly(TEMPLATE_CONTENT_MAX_BYTES + 1)), user_id: 'other-user', is_public: true },
    ]);

    await expectTooLarge(await handleTemplates(new Request('http://localhost/api/templates/template-1/clone', {
      method: 'POST',
      body: JSON.stringify({ visibility: 'private' }),
    }), env));
  });

  it('leaves out of reconciliation a run the change would take past the run limit, which goes stale while the save and other runs go through', async () => {
    const templateBytes = 400 * 1024;
    const stored = sectionsMeasuringExactly(templateBytes);
    dbMocks.selectChain.limit.mockResolvedValueOnce([storedTemplate(stored)]);
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      { id: 'run-full', items: JSON.stringify(runWithNotesFillingItTo(RUN_CONTENT_MAX_BYTES - 100, templateBytes)), retired_items: '[]', status: 'in_progress', is_public: false, revision: 1 },
      { id: 'run-small', items: JSON.stringify(runWithNotesFillingItTo(templateBytes + 1000, templateBytes)), retired_items: '[]', status: 'in_progress', is_public: false, revision: 1 },
    ]);
    const grown = [{ ...stored[0], items: [...stored[0].items, { id: 'item-2', title: 'New', description: '', contents: [{ id: 'content-2', type: 'text', value: 'y'.repeat(1000) }] }] }];

    const response = await put(grown);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(expect.objectContaining({ structureChanged: true, reconciledRuns: 1 }));
    const runUpdates = dbMocks.updateChain.set.mock.calls.map(([values]) => values).filter((values) => 'retired_items' in values);
    expect(runUpdates).toHaveLength(1);
    expect(contentSaveBytes(JSON.parse(runUpdates[0].items))).toBeLessThan(templateBytes + 5000);
  });
});

describe('Run content limit', () => {
  const run = (sections: unknown, extra: Record<string, unknown> = {}) => ({
    id: 'run-1',
    user_id: 'user-123',
    team_id: null,
    template_id: 'template-1',
    title: 'Run',
    items: JSON.stringify(sections),
    retired_items: '[]',
    status: 'in_progress',
    revision: 2,
    is_public: false,
    started_at: '2026-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    ...extra,
  });
  const putRun = (sections: unknown) => handleChecklists(new Request('http://localhost/api/checklists/run-1', {
    method: 'PUT',
    body: JSON.stringify({ sections, status: 'in_progress', expected_revision: 2 }),
  }), env);

  it('refuses to start a run from a template too large for the run to be saved', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([{
      id: 'template-1',
      user_id: 'user-123',
      owner_type: 'user',
      team_id: null,
      title: 'Guide',
      items: JSON.stringify(sectionsMeasuringExactly(RUN_CONTENT_MAX_BYTES + 1)),
      is_public: false,
      version: 1,
    }]);

    await expectTooLarge(await handleChecklists(new Request('http://localhost/api/checklists', {
      method: 'POST',
      body: JSON.stringify({ template_id: 'template-1' }),
    }), env));
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
  });

  it('refuses a save whose notes take the run past the limit', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([run(runWithNotesFillingItTo(RUN_CONTENT_MAX_BYTES - 10, 1000))]);

    await expectTooLarge(await putRun(runWithNotesFillingItTo(RUN_CONTENT_MAX_BYTES + 90, 1000)));
  });

  it('saves an untick on a run at the limit, so a run whose notes reached it still records progress both ways', async () => {
    const ticked = runWithNotesFillingItTo(RUN_CONTENT_MAX_BYTES, 1000, { isCompleted: true });
    dbMocks.selectChain.limit.mockResolvedValueOnce([run(ticked)]);

    const response = await putRun(runWithNotesFillingItTo(RUN_CONTENT_MAX_BYTES, 1000, { isCompleted: false }));

    expect(response.status).toBe(200);
    expect(dbMocks.db.batch).toHaveBeenCalledTimes(1);
  });

  it('refuses a revalidate that would take the run past the limit', async () => {
    const templateBytes = 400 * 1024;
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([run(runWithNotesFillingItTo(RUN_CONTENT_MAX_BYTES - 100, templateBytes))])
      .mockResolvedValueOnce([{
        id: 'template-1',
        version: 2,
        owner_type: 'user',
        team_id: null,
        user_id: 'user-123',
        is_public: false,
        items: JSON.stringify(sectionsMeasuringExactly(templateBytes + 1000)),
      }]);

    await expectTooLarge(await handleChecklists(new Request('http://localhost/api/checklists/run-1/revalidate', {
      method: 'POST',
      body: JSON.stringify({ expected_revision: 2 }),
    }), env));
  });

  it('refuses a share-link save whose notes take the run past the limit', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    const stored = sectionsMeasuringExactly(RUN_CONTENT_MAX_BYTES - 10, { isCompleted: false });
    dbMocks.selectChain.limit.mockResolvedValueOnce([run(stored, { is_public: true, share_token: 'share-1' })]);

    await expectTooLarge(await handleChecklists(new Request('http://localhost/api/checklists/shared/share-1', {
      method: 'PUT',
      body: JSON.stringify({
        sections: [{ id: 'section-1', items: [{ id: 'item-1', notes: 'n'.repeat(100) }] }],
        expected_revision: 2,
      }),
    }), env));
  });
});
