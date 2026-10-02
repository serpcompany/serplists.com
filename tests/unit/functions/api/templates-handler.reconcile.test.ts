import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementAt, firstOf, onlyElement, taskIn } from '../../../support/elements';
import { z } from 'zod';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import { dbMocks, mockEnv, resetTemplatesHandlerMocks, successBody } from '../../../support/templatesHandler';
import { schema } from '@functions/api/db';
import { handleTemplates } from '@functions/api/handlers/templates';
import { insertRowWhere } from '@functions/api/utils/guarded-insert';
import { reconcileRunSections } from '@functions/api/utils/template-reconciliation';
import { getSessionUserId } from '@functions/api/utils/session';
import { columnNamesIn } from '../../../support/drizzleSql';
import { storedSections, storedSectionsAsTheEditorResendsThem } from '../../../fixtures/editorResentSections';
import { apiErrorBody, readJson } from '../../../support/readJson';
import { objectContaining } from '../../../support/asymmetricMatchers';
import { jsonRecordIn, jsonRecordsIn, storedSectionsIn } from '../../../support/storedJson';

const reconciledBody = z.object({ reconciledRuns: z.number() }).passthrough();
const auditEventRow = z
  .object({ action: z.string(), resource_id: z.string(), actor_user_id: z.string().nullable(), metadata_json: z.string() })
  .passthrough();

describe('Templates Handlers', () => {
  beforeEach(resetTemplatesHandlerMocks);

  it('should reconcile active private runs without losing completion or notes', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'template-1',
        user_id: 'user-123',
        title: 'Existing Template',
        description: '',
        items: JSON.stringify([
          {
            id: 'section-1',
            title: 'Old checklist',
            items: [{ id: 'item-1', title: 'Old title', isCompleted: true, notes: 'Keep me' }],
          },
        ]),
        version: 1,
        is_public: false,
        slug: 'existing-template',
        created_at: new Date().toISOString(),
        updated_at: null,
      },
    ]);
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: 'run-1',
        user_id: 'user-123',
        team_id: null,
        template_id: 'template-1',
        title: 'Active run',
        items: JSON.stringify([
          {
            id: 'section-1',
            title: 'Old checklist',
            items: [{ id: 'item-1', title: 'Old title', isCompleted: true, notes: 'Keep me' }],
          },
        ]),
        retired_items: '[]',
        status: 'in_progress',
        is_public: false,
        revision: 4,
      },
      {
        id: 'run-2',
        user_id: 'user-123',
        team_id: null,
        template_id: 'template-1',
        title: 'Second active run',
        items: JSON.stringify([
          {
            id: 'section-1',
            title: 'Old checklist',
            items: [{ id: 'item-1', title: 'Old title', isCompleted: false, notes: 'Different progress' }],
          },
        ]),
        retired_items: '[]',
        status: 'in_progress',
        is_public: false,
        revision: 8,
      },
      {
        id: 'completed-run',
        template_id: 'template-1',
        items: '[]',
        status: 'completed',
        is_public: false,
        deleted_at: null,
        revision: 2,
      },
      {
        id: 'archived-run',
        template_id: 'template-1',
        items: '[]',
        status: 'in_progress',
        is_public: false,
        deleted_at: '2026-09-01T00:00:00Z',
        revision: 3,
      },
      {
        id: 'shared-run',
        template_id: 'template-1',
        items: '[]',
        status: 'in_progress',
        is_public: true,
        deleted_at: null,
        revision: 4,
      },
    ]);

    const request = new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({
        sections: [
          {
            id: 'section-1',
            title: 'Checklist',
            items: [{
              id: 'item-1',
              title: 'Start with the renamed project',
              contents: [],
            }, {
              id: 'item-2',
              title: 'New requirement',
            }],
          },
        ],
        expected_version: 1,
      }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, successBody);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(dbMocks.updateChain.set).toHaveBeenCalledTimes(3);
    const runUpdate = elementAt(dbMocks.updateChain.set.mock.calls, 1)[0];
    const reconciledItems = storedSectionsIn(runUpdate.items);
    expect(firstOf(reconciledItems).items).toEqual([
      objectContaining({
        id: 'item-1',
        title: 'Start with the renamed project',
        isCompleted: true,
        notes: 'Keep me',
      }),
      objectContaining({ id: 'item-2', isCompleted: false }),
    ]);
    expect(runUpdate).toEqual(objectContaining({
      progress: 50,
      template_version: 2,
      revision: 5,
    }));
    const secondRunUpdate = elementAt(dbMocks.updateChain.set.mock.calls, 2)[0];
    expect(secondRunUpdate).toEqual(objectContaining({
      progress: 0,
      template_version: 2,
      revision: 9,
    }));
    expect(taskIn(storedSectionsIn(secondRunUpdate.items), 0, 0)).toEqual(objectContaining({
      id: 'item-1',
      isCompleted: false,
      notes: 'Different progress',
    }));
    expect(dbMocks.updateChain.set.mock.calls).toHaveLength(3);

    const lifecyclePredicate = dbMocks.selectChain.where.mock.calls.at(-1)?.[0];
    const predicateColumns = columnNamesIn(lifecyclePredicate);
    expect(predicateColumns).toContain('status');
    expect(predicateColumns).toContain('is_public');
    expect(predicateColumns).toContain('deleted_at');
  });

  it('keeps the run state of a task a save moves to another section', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    const stored = [
      { id: 'A', title: 'Plan', items: [{ id: 'x', title: 'Call vendor' }, { id: 'y', title: 'Draft brief' }] },
      { id: 'B', title: 'Ship', items: [{ id: 'z', title: 'Publish' }] },
    ];
    dbMocks.selectChain.limit.mockResolvedValueOnce([{
      id: 'template-1', user_id: 'user-123', title: 'Launch', description: '', items: JSON.stringify(stored),
      version: 1, is_public: false, slug: 'launch', created_at: new Date().toISOString(), updated_at: null,
    }]);
    const run = [
      { id: 'A', title: 'Plan', items: [{ id: 'x', title: 'Call vendor', isCompleted: true, notes: 'called vendor' }, { id: 'y', title: 'Draft brief', isCompleted: false }] },
      { id: 'B', title: 'Ship', items: [{ id: 'z', title: 'Publish', isCompleted: false }] },
    ];
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      { id: 'run-1', user_id: 'user-123', team_id: null, template_id: 'template-1', items: JSON.stringify(run), retired_items: '[]', status: 'in_progress', is_public: false, revision: 3 },
    ]);

    const response = await handleTemplates(new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({
        sections: [
          { id: 'A', title: 'Plan', items: [{ id: 'y', title: 'Draft brief' }] },
          { id: 'B', title: 'Ship', items: [{ id: 'z', title: 'Publish' }, { id: 'x', title: 'Call vendor' }] },
        ],
        expected_version: 1,
      }),
    }), mockEnv);

    expect(response.status).toBe(200);
    const runUpdate = elementAt(dbMocks.updateChain.set.mock.calls, 1)[0];
    expect(taskIn(storedSectionsIn(runUpdate.items), 1, 1)).toEqual(objectContaining({ id: 'x', isCompleted: true, notes: 'called vendor' }));
    expect(jsonRecordsIn(runUpdate.retired_items)).toEqual([]);
    expect(runUpdate.progress).toBe(33);
  });

  describe('template saves that resend unchanged sections', () => {
    const storedTemplate = {
      id: 'template-1',
      user_id: 'user-123',
      owner_type: 'user',
      team_id: null,
      title: 'Launch plan',
      description: 'Ship it',
      type: 'checklist',
      seo_title: '',
      seo_description: '',
      items: JSON.stringify(storedSections),
      category: '[]',
      tags: '["launch"]',
      slug: 'launch-plan',
      version: 3,
      content_version: 2,
      is_public: false,
    };
    const editorSaveOfTheStoredTemplate = {
      title: 'Launch plan',
      description: 'Ship it',
      type: 'checklist',
      seoTitle: '',
      seoDescription: '',
      sections: storedSectionsAsTheEditorResendsThem,
      categories: [],
      tags: ['launch'],
      is_public: false,
      slug: 'launch-plan',
      expected_version: 3,
    };
    const put = (body: unknown) => handleTemplates(new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify(body),
    }), mockEnv);
    const versionInserts = () => dbMocks.insertChain.values.mock.calls.filter(([values]) => 'snapshot_json' in values);

    beforeEach(() => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      dbMocks.selectChain.limit.mockResolvedValueOnce([storedTemplate]);
    });

    it('saves metadata edits without bumping content_version or rewriting runs', async () => {
      const response = await put({ ...editorSaveOfTheStoredTemplate, title: 'Launch plan v2', description: 'Ship it well', is_public: true });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(objectContaining({ success: true, structureChanged: false, reconciledRuns: 0, content_version: 2, version: 4 }));
      expect(dbMocks.updateChain.set).toHaveBeenCalledTimes(1);
      const templateUpdate = firstOf(dbMocks.updateChain.set.mock.calls)[0];
      expect(templateUpdate).toEqual(objectContaining({ title: 'Launch plan v2', description: 'Ship it well', is_public: true, version: 4 }));
      expect(templateUpdate).not.toHaveProperty('content_version');
      expect(templateUpdate).not.toHaveProperty('items');
      expect(templateUpdate).not.toHaveProperty('slug');
      expect(dbMocks.selectChain.orderBy).not.toHaveBeenCalled();
      expect(versionInserts()).toHaveLength(1);
    });

    it('versions a visibility change, so a stale editor gets a conflict, without touching content or runs', async () => {
      const response = await put({ is_public: true, expected_version: 3 });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(objectContaining({ version: 4, content_version: 2, structureChanged: false, reconciledRuns: 0 }));
      const templateUpdate = firstOf(dbMocks.updateChain.set.mock.calls)[0];
      expect(templateUpdate).toEqual(objectContaining({ is_public: true, version: 4 }));
      expect(templateUpdate).not.toHaveProperty('content_version');
      expect(versionInserts()).toHaveLength(1);
      expect(firstOf(versionInserts())[0]).toEqual(objectContaining({ version: 4 }));
      expect(dbMocks.selectChain.orderBy).not.toHaveBeenCalled();
    });

    it('rejects an editor save made before a visibility change', async () => {
      dbMocks.selectChain.limit.mockReset();
      dbMocks.selectChain.limit.mockResolvedValue([]);
      dbMocks.selectChain.limit.mockResolvedValueOnce([{ ...storedTemplate, is_public: true, version: 4 }]);

      const response = await put({ ...editorSaveOfTheStoredTemplate, title: 'Launch plan (typo fixed)', is_public: false, expected_version: 3 });
      const data = await readJson(response, apiErrorBody);

      expect(response.status).toBe(409);
      expect(data.code).toBe('edit_conflict');
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });

    it('does not version a resent, unchanged visibility', async () => {
      const response = await put({ is_public: false, expected_version: 3 });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(objectContaining({ version: 3 }));
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });

    it('accepts a save with no changes without writing anything', async () => {
      const response = await put(editorSaveOfTheStoredTemplate);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(objectContaining({ success: true, version: 3, content_version: 2, structureChanged: false }));
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
      expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    });

    it('still reconciles active runs when the checklist structure changes', async () => {
      const reordered = structuredClone(storedSectionsAsTheEditorResendsThem);
      firstOf(reordered).items.reverse();
      dbMocks.selectChain.orderBy.mockResolvedValueOnce([
        { id: 'run-1', items: JSON.stringify(storedSections), retired_items: '[]', status: 'in_progress', is_public: false, revision: 1 },
      ]);

      const response = await put({ ...editorSaveOfTheStoredTemplate, sections: reordered });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(objectContaining({ structureChanged: true, reconciledRuns: 1, content_version: 3, version: 4 }));
      expect(firstOf(dbMocks.updateChain.set.mock.calls)[0]).toEqual(objectContaining({ content_version: 3, version: 4 }));
      expect(firstOf(storedSectionsIn(firstOf(dbMocks.updateChain.set.mock.calls)[0].items)).items.map((item) => item.id))
        .toEqual(['item-2', 'item-1']);
      expect(elementAt(dbMocks.updateChain.set.mock.calls, 1)[0]).toEqual(objectContaining({ template_version: 3, revision: 2 }));
    });
    it('records a reconciled event on each run whose work changed, naming what it retired but never its notes, on the run update\'s own condition', async () => {
      const withoutPublish = storedSectionsAsTheEditorResendsThem.map((section) => ({
        ...section,
        items: section.items.filter((item) => item.id !== 'item-2'),
      }));
      const annotatedRun = storedSectionsIn(JSON.stringify(storedSections));
      Object.assign(taskIn(annotatedRun, 0, 1), { isCompleted: true, notes: 'Registrar login is in vault X' });
      const runAlreadyMatchingTheNewStructure = reconcileRunSections(storedSections, withoutPublish, []).sections;
      dbMocks.selectChain.orderBy.mockResolvedValueOnce([
        { id: 'run-1', items: JSON.stringify(annotatedRun), retired_items: '[]', status: 'in_progress', is_public: false, revision: 4 },
        { id: 'run-2', items: JSON.stringify(runAlreadyMatchingTheNewStructure), retired_items: '[]', status: 'in_progress', is_public: false, revision: 2 },
      ]);
      const changed = { meta: { changes: 1 } };
      dbMocks.db.batch.mockResolvedValueOnce([changed, changed, changed, changed, changed, { meta: { changes: 0 } }]);

      const response = await put({ ...editorSaveOfTheStoredTemplate, sections: withoutPublish });
      const data = await readJson(response, reconciledBody);

      expect(response.status).toBe(200);
      expect(data.reconciledRuns).toBe(1);
      const reconciledEvents = vi.mocked(insertRowWhere).mock.calls.flatMap(([, table, values, condition], call) => {
        const event = auditEventRow.safeParse(values);
        return table === schema.audit_events && event.success && event.data.action === 'checklist_run.reconciled'
          ? [{ call, condition, event: event.data }]
          : [];
      });
      const { call, condition, event } = onlyElement(reconciledEvents);
      expect(event).toEqual(objectContaining({ resource_id: 'run-1', actor_user_id: 'user-123' }));
      expect(jsonRecordIn(event.metadata_json)).toEqual(objectContaining({
        templateId: 'template-1',
        templateVersion: 3,
        fromRevision: 4,
        toRevision: 5,
        retired: [{ kind: 'item', id: 'item-2', title: 'Publish' }],
      }));
      expect(JSON.stringify(event)).not.toContain('vault X');
      const guard = new SQLiteSyncDialect().sqlToQuery(condition);
      expect(guard.sql).toMatch(/^exists \(select 1 from "checklist_runs" where .*"checklist_runs"\."revision" = \?/);
      expect(guard.params).toContain(4);
      const statements = firstOf(dbMocks.db.batch.mock.calls)[0];
      expect(statements).toHaveLength(6);
      expect(statements[3]).toBe(elementAt(vi.mocked(insertRowWhere).mock.results, call).value);
      expect(statements[4]).toBe(dbMocks.updateChain);
      expect(jsonRecordsIn(elementAt(dbMocks.updateChain.set.mock.calls, 1)[0].retired_items)).toEqual([
        objectContaining({ kind: 'item', item: objectContaining({ id: 'item-2', notes: 'Registrar login is in vault X' }) }),
      ]);
    });
  });
});
