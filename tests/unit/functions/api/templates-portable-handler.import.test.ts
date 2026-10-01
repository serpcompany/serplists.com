import { beforeEach, describe, expect, it } from 'vitest';
import {
  dbMocks,
  importBody,
  importPack,
  mockEnv,
  packBody,
  resetPortableTemplatesHandlerMocks,
} from '../../../support/portableTemplatesHandler';
import { handleTemplates } from '@functions/api/handlers/templates';
import { portableTemplatePackSchema } from '@/lib/schemas/checklistSchema';
import { apiErrorBody, readJson } from '../../../support/readJson';

describe('portable template import/export API', () => {
  beforeEach(resetPortableTemplatesHandlerMocks);

  it('imports portable template packs', async () => {
    dbMocks.selectChain.limit.mockResolvedValue([]);

    const request = new Request('http://localhost/api/templates/backup', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'serplists-template-pack',
        schemaVersion: '2.0.0',
        exportedAt: '2026-03-21T00:00:00.000Z',
        templates: [
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
            sections: [{ title: 'Checklist', items: [{ title: 'Item' }] }],
          },
        ],
      }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, importBody);

    expect(response.status).toBe(200);
    expect(data.total).toBe(1);
    expect(data.imported).toBe(1);
    expect(data.successes).toEqual([
      expect.objectContaining({
        index: 0,
        title: 'Imported Portable Template',
        visibility: 'public',
      }),
    ]);

    expect(dbMocks.db.batch).toHaveBeenCalled();
    expect(dbMocks.db.batch.mock.calls[0][0]).toHaveLength(3);
    const inserted = dbMocks.insertChain.values.mock.calls[0][0];
    expect(inserted.is_public).toBe(true);
    expect(inserted.seo_title).toBe('Imported SEO Title');
    expect(inserted.seo_description).toBe('Imported SEO Description');
    expect(inserted.rules).toContain('required-field');
  });

  it('imports portable template packs into paid team workspaces', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'editor', status: 'active' },
    ]).mockResolvedValue([]);

    const request = new Request('http://localhost/api/templates/backup?teamId=team-1', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'serplists-template-pack',
        schemaVersion: '2.0.0',
        exportedAt: '2026-03-21T00:00:00.000Z',
        templates: [
          {
            title: 'Imported Team Template',
            visibility: 'private',
            sections: [{ title: 'Checklist', items: [{ title: 'Item' }] }],
          },
        ],
      }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, importBody);

    expect(response.status).toBe(200);
    expect(data.imported).toBe(1);

    expect(dbMocks.db.batch).toHaveBeenCalled();
    expect(dbMocks.db.batch.mock.calls[0][0]).toHaveLength(3);
    const inserted = dbMocks.insertChain.values.mock.calls[0][0];
    expect(inserted.owner_type).toBe('team');
    expect(inserted.team_id).toBe('team-1');
    expect(inserted.created_by_user_id).toBe('user-123');
  });

  it('rejects unsupported portable schema versions', async () => {
    const request = new Request('http://localhost/api/templates/backup', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'serplists-template-pack',
        schemaVersion: '9.9.9',
        exportedAt: '2026-03-21T00:00:00.000Z',
        templates: [
          {
            title: 'Imported Portable Template',
            sections: [{ title: 'Checklist', items: [{ title: 'Item' }] }],
          },
        ],
      }),
    });

    const response = await handleTemplates(request, mockEnv);
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
    const data = await readJson(response, importBody);

    expect(response.status).toBe(200);
    expect(data.imported).toBe(2);
    expect(data.failed).toEqual([]);
  });

  it('fails only the template whose asset is over the upload limit', async () => {
    const response = await importPack([packWithAsset(50 * 1024 * 1024 + 1), packWithAsset(1024)]);
    const data = await readJson(response, importBody);

    expect(response.status).toBe(200);
    expect(data.imported).toBe(1);
    expect(data.failed).toEqual([
      expect.objectContaining({ index: 0, code: 'oversized_asset', reason: expect.stringContaining('50MB') }),
    ]);
  });

  it('fails only the template whose content is too large to be saved again', async () => {
    const textHeavy = {
      title: 'Long guide',
      sections: [{ title: 'Guide', items: [{ title: 'Read it', contents: [{ type: 'text', value: 'x'.repeat(1_200_000) }] }] }],
    };
    const response = await importPack([textHeavy, packWithAsset(1024)]);
    const data = await readJson(response, importBody);

    expect(response.status).toBe(200);
    expect(data.imported).toBe(1);
    expect(data.successes).toEqual([expect.objectContaining({ index: 1 })]);
    expect(data.failed).toEqual([
      expect.objectContaining({ index: 0, title: 'Long guide', code: 'content_too_large', reason: expect.stringContaining('KB') }),
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

      const response = await handleTemplates(new Request('http://localhost/api/templates/backup', { method: 'GET' }), mockEnv);
      const pack = await readJson(response, packBody);

      expect(response.status).toBe(200);
      expect(portableTemplatePackSchema.safeParse(pack).success).toBe(true);
      expect(pack.templates).toHaveLength(1);
      expect(pack.manifest.totalTemplates).toBe(1);
      expect(pack.manifest.skippedTemplates).toEqual([expect.objectContaining({ title: 'Corrupt' })]);
      const [template] = pack.templates;
      expect(template.type).toBe('checklist');
      expect(template.sections.map((section) => [section.id, section.title]))
        .toEqual([['s-1', 'Section 1'], ['s-2', 'Section 2']]);
      expect(template.sections[0].items[1].title).toBe('Task 2');
      expect(template.sections[0].items[0].contents).toEqual([
        { id: 'c-1', type: 'text', value: '' },
        { id: 'c-4', type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Short' }] },
      ]);

      const importResponse = await handleTemplates(new Request('http://localhost/api/templates/backup', {
        method: 'POST',
        body: JSON.stringify(pack),
      }), mockEnv);
      const summary = await readJson(importResponse, importBody);

      expect(importResponse.status).toBe(200);
      expect(summary.imported).toBe(1);
    });

    it('imports older packs with blank fields and fails only the invalid template', async () => {
      const response = await handleTemplates(new Request('http://localhost/api/templates/backup', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'serplists-template-pack',
          schemaVersion: '2.0.0',
          exportedAt: '2026-03-21T00:00:00.000Z',
          templates: [
            { title: 'No tasks', sections: [] },
            {
              title: 'Old export',
              sections: [{ title: '', items: [{ title: 'Pack', contents: [{ type: 'video', value: '' }] }] }],
            },
          ],
        }),
      }), mockEnv);
      const summary = await readJson(response, importBody);

      expect(response.status).toBe(200);
      expect(summary.total).toBe(2);
      expect(summary.imported).toBe(1);
      expect(summary.successes).toEqual([expect.objectContaining({ index: 1, title: 'Old export' })]);
      expect(summary.failed).toEqual([expect.objectContaining({ index: 0, title: 'No tasks', code: 'invalid_sections' })]);
      const inserted = dbMocks.insertChain.values.mock.calls[0][0];
      expect(JSON.parse(inserted.items)[0]).toEqual(expect.objectContaining({ title: 'Section 1' }));
    });
  });
});
