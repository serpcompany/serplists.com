import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  // select: INSERT ... SELECT, which guarded writes (audit rows, versions) use.
  const insertChain = { values: vi.fn(), select: vi.fn() };
  const db = {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
    update: vi.fn(),
    batch: vi.fn(),
  };

  return { selectChain, insertChain, db };
});

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => dbMocks.db),
}));

vi.mock('@functions/api/utils/session', () => ({
  getSessionUserId: vi.fn(),
}));

vi.mock('@functions/api/utils/entitlements', () => {
  const pro = async () => ({ plan: 'pro', limits: { maxTemplates: null, maxActiveRuns: null } });
  return { getEntitlementsForUser: vi.fn(pro), getEntitlementsForContext: vi.fn(pro) };
});

import { schema } from '@functions/api/db';
import { handleTemplates } from '@functions/api/handlers/templates';
import { getSessionUserId } from '@functions/api/utils/session';
import {
  buildTemplateEditorSavedState,
  loadTemplateEditorData,
  saveTemplateEditorData,
  type TemplateEditorLoadResult,
} from '@/features/template-editor/useTemplateEditorModel';
import { persistTemplateSave, type SaveTemplateInput } from '@/hooks/useTemplateSave';
import { applyTemplateSaveDefaults } from '@/hooks/useTemplateValidation';
import type { TemplateEditorFormValues } from '@/lib/forms/templateEditorForm';
import { buildTemplateUpdateRequest } from '@/lib/templates/templateUpdate';
import { parseTemplateUpdateResponse } from '@/lib/templateUpdateResult';

// Rows stored before stable ids existed, or with ids that are not text (a JSON import with
// numbers, a blank or whitespace id), have no id the API accepts. The editor must resend
// the ids the API stored, so a second save in the same editor session never renumbers the
// Template and retires every active run's progress.

type Row = Record<string, unknown>;

const mockEnv = { DB: {}, BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' };

const subTasks = (ids: [unknown, unknown], ticked: boolean) => [
  { type: 'subItems', value: '', subItems: [
    { id: ids[0], title: 'Check title tags', ...(ticked ? { isCompleted: true } : {}) },
    { id: ids[1], title: 'Check meta descriptions', ...(ticked ? { isCompleted: true } : {}) },
  ] },
];

const legacySections = (subItemIds: [[unknown, unknown], [unknown, unknown]], run = false) => [
  {
    id: '  ',
    title: 'Audit',
    items: [
      { id: 1, title: 'Crawl the site', contents: subTasks(subItemIds[0], run), ...(run ? { isCompleted: true, notes: 'Crawled with the new rules' } : {}) },
      { id: 2, title: 'Review on-page SEO', contents: subTasks(subItemIds[1], false) },
      { id: 3, title: 'Write the report', ...(run ? { isCompleted: true } : {}) },
    ],
  },
];

const cases: Array<[string, [[unknown, unknown], [unknown, unknown]]]> = [
  ['numeric Sub-task ids', [[11, 12], [21, 22]]],
  ['Sub-task ids that restart in every task', [[1, 2], [1, 2]]],
];

function createStore(subItemIds: [[unknown, unknown], [unknown, unknown]]) {
  const template: Row = {
    id: 'template-1',
    user_id: 'user-123',
    owner_type: 'user',
    team_id: null,
    title: 'Technical SEO audit',
    description: '',
    type: 'checklist',
    items: JSON.stringify(legacySections(subItemIds)),
    version: 3,
    content_version: 3,
    is_public: false,
    slug: 'technical-seo-audit',
    category: '[]',
    tags: '[]',
    deleted_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: null,
  };
  const run: Row = {
    id: 'run-1',
    user_id: 'user-123',
    team_id: null,
    template_id: 'template-1',
    title: 'Audit run',
    items: JSON.stringify(legacySections(subItemIds, true)),
    retired_items: '[]',
    status: 'in_progress',
    is_public: false,
    deleted_at: null,
    progress: 60,
    revision: 1,
    template_version: 3,
    created_at: '2026-01-02T00:00:00.000Z',
  };
  return { template, run };
}

type Store = ReturnType<typeof createStore>;

// A D1 stand-in that reads the stored rows and applies the handler's batched updates to them.
function useStore(store: Store) {
  dbMocks.selectChain.limit.mockImplementation(async () => [store.template]);
  dbMocks.selectChain.orderBy.mockImplementation(async () => [store.run]);
  dbMocks.db.update.mockImplementation((table: unknown) => ({
    set: (values: Row) => ({ where: () => ({ table, values }) }),
  }));
  dbMocks.db.batch.mockImplementation(async (statements: Array<{ table?: unknown; values?: Row }>) => {
    for (const statement of statements) {
      if (statement.table === schema.templates) Object.assign(store.template, statement.values);
      if (statement.table === schema.checklist_runs) Object.assign(store.run, statement.values);
    }
    return statements.map(() => ({ meta: { changes: 1 } }));
  });
}

const apiClient = {
  getTemplateById: async (id: string) => {
    const response = await handleTemplates(new Request(`http://localhost/api/templates/${id}`), mockEnv as never);
    expect(response.status).toBe(200);
    return response.json();
  },
};

const responses: Array<Record<string, unknown>> = [];

// The editor's save path down to the API call, with the real PUT handler behind it.
const saveTemplate = (input: SaveTemplateInput) => persistTemplateSave({
  createTemplate: vi.fn(),
  updateTemplate: async (payload) => {
    const response = await handleTemplates(new Request(`http://localhost/api/templates/${payload.id}`, {
      method: 'PUT',
      body: JSON.stringify(buildTemplateUpdateRequest(payload)),
    }), mockEnv as never);
    const body = (await response.json()) as Record<string, unknown>;
    responses.push(body);
    if (!response.ok) throw new Error(String(body.error));
    return parseTemplateUpdateResponse(body);
  },
  applyDefaults: applyTemplateSaveDefaults,
}, input);

// Saves the form as the editor does and returns the baseline it rebases the form onto.
async function saveAs(state: { loaded: TemplateEditorLoadResult; version?: number }, values: TemplateEditorFormValues) {
  const result = await saveTemplateEditorData({
    id: 'template-1',
    expectedVersion: state.version,
    storedSlug: state.loaded.templateSlug,
    loadedIsPublic: state.loaded.initialValues.isPublic,
    values,
  }, { saveTemplate });
  expect(result.errors).toEqual([]);
  expect(result.success).toBe(true);
  return {
    loaded: buildTemplateEditorSavedState(values, { storedSlug: state.loaded.templateSlug, savedSlug: result.slug }, result.saved),
    version: result.version,
  };
}

const withTaskTitle = (values: TemplateEditorFormValues, itemIndex: number, title: string): TemplateEditorFormValues => ({
  ...values,
  sections: values.sections.map((section, sectionIndex) => sectionIndex !== 0 ? section : {
    ...section,
    items: section.items.map((item, index) => (index === itemIndex ? { ...item, title } : item)),
  }),
});

const storedIds = (items: unknown): string[] => (JSON.parse(String(items)) as Row[]).flatMap((section) => [
  String(section.id),
  ...(section.items as Row[]).flatMap((item) => [
    String(item.id),
    ...((item.contents as Row[] | undefined) ?? []).flatMap((content) => (content.subItems as Row[]).map((subItem) => String(subItem.id))),
  ]),
]);

describe('saving a Template stored without stable ids', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    responses.length = 0;
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.leftJoin.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.insertChain.values.mockResolvedValue(undefined);
    dbMocks.insertChain.select.mockReturnValue({ kind: 'conditional-insert' });
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
  });

  it.each(cases)('keeps the ids and run progress over two saves in one editor session (%s)', async (_name, subItemIds) => {
    const store = createStore(subItemIds);
    useStore(store);
    const loaded = await loadTemplateEditorData({ id: 'template-1' }, { apiClient });
    const opened = { loaded, version: loaded.version };

    const afterFirst = await saveAs(opened, withTaskTitle(loaded.initialValues, 1, 'Review on-page SEO issues'));
    const idsAfterFirst = storedIds(store.template.items);
    expect(responses[0]).toMatchObject({ structureChanged: true, content_version: 4 });
    expect(JSON.parse(String(store.run.retired_items))).toEqual([]);

    await saveAs(afterFirst, withTaskTitle(afterFirst.loaded.initialValues, 2, 'Write and send the report'));

    expect(responses[1]).toMatchObject({ structureChanged: true, content_version: 5, reconciledRuns: 1 });
    // The second save found every section, task and Sub-task by the id the first one stored.
    expect(storedIds(store.template.items)).toEqual(idsAfterFirst);
    expect(JSON.parse(String(store.run.retired_items))).toEqual([]);
    const [section] = JSON.parse(String(store.run.items)) as Row[];
    const [crawl, review, report] = section.items as Row[];
    expect(crawl).toMatchObject({ isCompleted: true, notes: 'Crawled with the new rules' });
    expect(((crawl.contents as Row[])[0].subItems as Row[]).map((subItem) => subItem.isCompleted)).toEqual([true, true]);
    expect(review).toMatchObject({ title: 'Review on-page SEO issues', isCompleted: false });
    expect(report).toMatchObject({ title: 'Write and send the report', isCompleted: true });
    // 4 of 7 tasks and Sub-tasks are done.
    expect(store.run.progress).toBe(57);
  });

  it('stores nothing when the second save changes nothing', async () => {
    const store = createStore(cases[0][1]);
    useStore(store);
    const loaded = await loadTemplateEditorData({ id: 'template-1' }, { apiClient });

    const afterFirst = await saveAs({ loaded, version: loaded.version }, withTaskTitle(loaded.initialValues, 1, 'Review on-page SEO issues'));
    const itemsAfterFirst = store.template.items;
    await saveAs(afterFirst, afterFirst.loaded.initialValues);

    expect(responses[1]).toMatchObject({ structureChanged: false, content_version: 4 });
    expect(store.template.items).toBe(itemsAfterFirst);
  });

  it('gives a copy of a public Template stored without ids the ids its editor and runs use', async () => {
    const { template } = createStore(cases[0][1]);
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ ...template, user_id: 'other-user', is_public: true }]).mockResolvedValueOnce([]);

    const response = await handleTemplates(new Request('http://localhost/api/templates/template-1/clone', {
      method: 'POST',
      body: JSON.stringify({ visibility: 'private' }),
    }), mockEnv as never);

    expect(response.status).toBe(200);
    const copy = dbMocks.insertChain.values.mock.calls.map(([values]) => values as Row).find((values) => 'owner_type' in values);
    expect(storedIds(copy?.items)).toEqual([
      'legacy-section-1',
      'legacy-item-1-1', 'legacy-subitem-1-1-1', 'legacy-subitem-1-1-2',
      'legacy-item-1-2', 'legacy-subitem-1-2-1', 'legacy-subitem-1-2-2',
      'legacy-item-1-3',
    ]);
  });
});

// The official seed, starter packs, imports and copies of those store content blocks
// without ids, and the editor gives each block a new id when it loads. A save that
// changes only a detail must still not count as a structure change: that would bump
// content_version, rewrite active runs, and mark completed and shared runs stale.
const seedSections = (run = false) => [
  {
    id: 'sec-1',
    title: 'Audit',
    items: [
      {
        id: 't-1',
        title: 'Crawl the site',
        description: 'Start with the homepage.',
        contents: [
          { type: 'text', value: 'Use the crawler.' },
          { type: 'subItems', value: '', subItems: [
            { id: 'st-1', title: 'Check title tags', ...(run ? { isCompleted: true } : {}) },
            { id: 'st-2', title: 'Check meta descriptions' },
          ] },
        ],
        ...(run ? { isCompleted: true } : {}),
      },
      { id: 't-2', title: 'Write the report', contents: [{ type: 'image', value: 'https://example.com/report.png', uploadType: 'url' }] },
    ],
  },
];

describe('saving a Template whose content blocks have no ids', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    responses.length = 0;
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.leftJoin.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.insertChain.values.mockResolvedValue(undefined);
    dbMocks.insertChain.select.mockReturnValue({ kind: 'conditional-insert' });
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
  });

  it('keeps content_version and the run when a save changes only the description', async () => {
    const { template, run } = createStore(cases[0][1]);
    const store = {
      template: { ...template, items: JSON.stringify(seedSections()) },
      run: { ...run, items: JSON.stringify(seedSections(true)) },
    };
    const { items: storedItems } = store.template;
    const { items: runItems } = store.run;
    useStore(store);
    const loaded = await loadTemplateEditorData({ id: 'template-1' }, { apiClient });
    expect(JSON.stringify(loaded.initialValues.sections)).toContain('"id":"content_');

    await saveAs({ loaded, version: loaded.version }, { ...loaded.initialValues, description: 'Fixed a typo' });

    expect(responses[0]).toMatchObject({ structureChanged: false, content_version: 3 });
    expect(store.template.description).toBe('Fixed a typo');
    expect(store.template.items).toBe(storedItems);
    expect(store.run).toMatchObject({ items: runItems, revision: 1, template_version: 3 });
  });
});
