import { beforeEach, describe, expect, it } from 'vitest';
import { firstOf, taskAt } from '../../../support/elements';
import {
  dbMocks,
  expectTheOrganizationOwnsIt,
  importBody,
  importPack,
  mockEnv,
  packBody,
  resetPortableTemplatesHandlerMocks,
} from '../../../support/portableTemplatesHandler';
import { handleTemplates } from '@functions/api/handlers/templates';
import { portableTemplatePackSchema } from '@/lib/schemas/checklistSchema';
import { activeMember } from '../../../fixtures/handlerRows';
import { apiRequest } from '../../../support/apiRequest';
import { apiErrorBody, readJson, readSuccessfulJson } from '../../../support/readJson';
import { objectContaining, stringContaining } from '../../../support/asymmetricMatchers';
import { storedSectionsIn } from '../../../support/storedJson';

const ONE_ITEM_CHECKLIST = [{ title: 'Checklist', items: [{ title: 'Item' }] }];

describe('portable template import/export API', () => {
  beforeEach(resetPortableTemplatesHandlerMocks);

  it('imports portable template packs', async () => {
    dbMocks.selectChain.limit.mockResolvedValue([]);

    const response = await importPack([
      {
        title: 'Imported Portable Template',
        visibility: 'public',
        seoTitle: 'Imported SEO Title',
        seoDescription: 'Imported SEO Description',
        rules: [
          {
            id: 'rule-1',
            type: 'required-field',
            path: 'sections[].items[].title',
            value: 'Every item needs a title',
            severity: 'error',
          },
        ],
        sections: ONE_ITEM_CHECKLIST,
      },
    ]);
    const data = await readSuccessfulJson(response, importBody);

    expect(data.total).toBe(1);
    expect(data.imported).toBe(1);
    expect(data.successes).toEqual([
      objectContaining({
        index: 0,
        title: 'Imported Portable Template',
        visibility: 'public',
      }),
    ]);

    expect(dbMocks.db.batch).toHaveBeenCalled();
    expect(firstOf(dbMocks.db.batch.mock.calls)[0]).toHaveLength(3);
    const inserted = firstOf(dbMocks.insertChain.values.mock.calls)[0];
    expect(inserted.is_public).toBe(true);
    expect(inserted.seo_title).toBe('Imported SEO Title');
    expect(inserted.seo_description).toBe('Imported SEO Description');
    expect(inserted.rules).toContain('required-field');
  });

  it('imports portable template packs into paid team workspaces', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([activeMember('editor')]).mockResolvedValue([]);

    const response = await importPack(
      [{ title: 'Imported Team Template', visibility: 'private', sections: ONE_ITEM_CHECKLIST }],
      { teamId: 'team-1' },
    );
    const data = await readSuccessfulJson(response, importBody);

    expect(data.imported).toBe(1);

    expect(dbMocks.db.batch).toHaveBeenCalled();
    expect(firstOf(dbMocks.db.batch.mock.calls)[0]).toHaveLength(3);
    expectTheOrganizationOwnsIt(firstOf(dbMocks.insertChain.values.mock.calls)[0]);
  });

  it('rejects unsupported portable schema versions', async () => {
    const response = await importPack(
      [{ title: 'Imported Portable Template', sections: ONE_ITEM_CHECKLIST }],
      { schemaVersion: '9.9.9' },
    );
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(400);
    expect(data.code).toBe('unsupported_portable_schema_version');
  });

  const packWithAsset = (fileSize: number) => ({
    title: `Template with a ${fileSize} byte asset`,
    sections: [
      {
        title: 'Docs',
        items: [
          {
            title: 'Read the brief',
            contents: [
              {
                type: 'file',
                value: '/api/uploads/file?key=template-files%2Fuser-123%2Fbrief.pdf',
                fileName: 'brief.pdf',
                fileSize,
                uploadType: 'upload',
              },
            ],
          },
        ],
      },
    ],
  });

  it('imports assets up to the upload limit, so an export holding a 50MB upload imports again', async () => {
    const response = await importPack([packWithAsset(8 * 1024 * 1024), packWithAsset(50 * 1024 * 1024)]);
    const data = await readSuccessfulJson(response, importBody);

    expect(data.imported).toBe(2);
    expect(data.failed).toEqual([]);
  });

  it('fails only the template whose asset is over the upload limit', async () => {
    const response = await importPack([packWithAsset(50 * 1024 * 1024 + 1), packWithAsset(1024)]);
    const data = await readSuccessfulJson(response, importBody);

    expect(data.imported).toBe(1);
    expect(data.failed).toEqual([
      objectContaining({ index: 0, code: 'oversized_asset', reason: stringContaining('50MB') }),
    ]);
  });

  it('fails only the template whose content is too large to be saved again', async () => {
    const textHeavy = {
      title: 'Long guide',
      sections: [{ title: 'Guide', items: [{ title: 'Read it', contents: [{ type: 'text', value: 'x'.repeat(1_200_000) }] }] }],
    };
    const response = await importPack([textHeavy, packWithAsset(1024)]);
    const data = await readSuccessfulJson(response, importBody);

    expect(data.imported).toBe(1);
    expect(data.successes).toEqual([objectContaining({ index: 1 })]);
    expect(data.failed).toEqual([
      objectContaining({ index: 0, title: 'Long guide', code: 'content_too_large', reason: stringContaining('KB') }),
    ]);
    expect(dbMocks.db.batch).toHaveBeenCalledTimes(1);
  });

  describe('templates saved the way the editor saves them', () => {
    const editorRows = () => [
      {
        id: 'template-1',
        title: 'Launch plan',
        description: null,
        type: 'foo',
        items: JSON.stringify([
          {
            id: 's-1',
            title: '',
            items: [
              {
                id: 'i-1',
                title: 'Write copy',
                contents: [
                  { id: 'c-1', type: 'text', value: '' },
                  { id: 'c-2', type: 'image', value: '' },
                  { id: 'c-3', type: 'embed', value: '   ' },
                  { id: 'c-4', type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Short' }, { id: 'sub-2', title: '' }] },
                  { id: 'c-5', type: 'subItems', value: '', subItems: [{ id: 'sub-3', title: ' ' }] },
                ],
              },
              { id: 'i-2', title: '' },
            ],
          },
          { id: 's-2', title: '   ', items: [{ id: 'i-3', title: 'Publish' }] },
          { id: 's-3', title: 'Empty', items: [] },
        ]),
        category: '[]',
        tags: '[]',
        user_id: 'user-123',
        is_public: 0,
        slug: 'launch-plan',
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: null,
        version: 1,
      },
      {
        id: 'template-2',
        title: 'Corrupt',
        description: '',
        items: 'not json',
        category: '[]',
        tags: '[]',
        user_id: 'user-123',
        is_public: 0,
        slug: 'corrupt',
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: null,
        version: 1,
      },
    ];

    it('exports a pack that passes the portable schema and re-imports', async () => {
      dbMocks.selectChain.orderBy.mockResolvedValueOnce(editorRows());

      const response = await handleTemplates(apiRequest('templates/backup'), mockEnv);
      const pack = await readJson(response, packBody);

      expect(response.status).toBe(200);
      expect(portableTemplatePackSchema.safeParse(pack).success).toBe(true);
      expect(pack.templates).toHaveLength(1);
      expect(pack.manifest.totalTemplates).toBe(1);
      expect(pack.manifest.skippedTemplates).toEqual([objectContaining({ title: 'Corrupt' })]);
      const template = firstOf(pack.templates);
      expect(template.type).toBe('checklist');
      expect(template.sections.map((section) => [section.id, section.title]))
        .toEqual([['s-1', 'Section 1'], ['s-2', 'Section 2']]);
      expect(taskAt(template, 0, 1).title).toBe('Task 2');
      expect(taskAt(template, 0, 0).contents).toEqual([
        { id: 'c-1', type: 'text', value: '' },
        { id: 'c-4', type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Short' }] },
      ]);

      const importResponse = await handleTemplates(apiRequest('templates/backup', 'POST', pack), mockEnv);
      const summary = await readSuccessfulJson(importResponse, importBody);

      expect(summary.imported).toBe(1);
    });

    it('imports older packs with blank fields and fails only the invalid template', async () => {
      const response = await importPack([
        { title: 'No tasks', sections: [] },
        {
          title: 'Old export',
          sections: [{ title: '', items: [{ title: 'Pack', contents: [{ type: 'video', value: '' }] }] }],
        },
      ]);
      const summary = await readSuccessfulJson(response, importBody);

      expect(summary.total).toBe(2);
      expect(summary.imported).toBe(1);
      expect(summary.successes).toEqual([objectContaining({ index: 1, title: 'Old export' })]);
      expect(summary.failed).toEqual([objectContaining({ index: 0, title: 'No tasks', code: 'invalid_sections' })]);
      const inserted = firstOf(dbMocks.insertChain.values.mock.calls)[0];
      expect(firstOf(storedSectionsIn(inserted.items))).toEqual(objectContaining({ title: 'Section 1' }));
    });
  });
});
