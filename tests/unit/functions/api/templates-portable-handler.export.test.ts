import { beforeEach, describe, expect, it } from 'vitest';
import {
  dbMocks,
  expectTheOrganizationPlanChecked,
  importBody,
  importPack,
  mockEnv,
  packBody,
  resetPortableTemplatesHandlerMocks,
} from '../../../support/portableTemplatesHandler';
import Ajv from 'ajv';

import { buildPortableTemplatePackJsonSchema } from '@/lib/schemas/portableTemplateJsonSchema';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import type { SQL } from 'drizzle-orm';
import { handleTemplates } from '@functions/api/handlers/templates';
import { activeMember, templateRowToExport } from '../../../fixtures/handlerRows';
import { apiRequest } from '../../../support/apiRequest';
import { readJson } from '../../../support/readJson';

async function exportPackOf(rows: Record<string, unknown>[], path = 'templates/backup') {
  dbMocks.selectChain.orderBy.mockResolvedValueOnce(rows);

  const response = await handleTemplates(apiRequest(path), mockEnv);
  const data = await readJson(response, packBody);

  expect(response.status).toBe(200);
  return data;
}

function expectValidAgainstThePortableJsonSchema(data: unknown) {
  const validate = new Ajv({ strict: false }).compile(buildPortableTemplatePackJsonSchema());
  expect(validate(data), JSON.stringify(validate.errors)).toBe(true);
}

describe('portable template import/export API', () => {
  beforeEach(resetPortableTemplatesHandlerMocks);

  it('exports portable template packs by default', async () => {
    const data = await exportPackOf([
      templateRowToExport({
        rules: JSON.stringify([
          {
            id: 'rule-1',
            type: 'required-field',
            path: 'sections[].items[].title',
            value: 'Every item needs a title',
            severity: 'error',
          },
        ]),
        category: '["seo"]',
        tags: '["tag-1"]',
        is_public: 1,
        seo_title: 'SEO Title',
        seo_description: 'SEO Description',
      }),
    ]);

    expect(data.kind).toBe('serplists-template-pack');
    expect(data.schemaVersion).toBe('2.0.0');
    expect(data.templates[0].visibility).toBe('public');
    expect(data.templates[0].seoTitle).toBe('SEO Title');
    expect(data.templates[0].seoDescription).toBe('SEO Description');
    expect(data.templates[0].rules).toHaveLength(1);
    expect(data.manifest.includesRules).toBe(true);
  });

  it('exports portable template packs for paid team workspaces', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([activeMember('editor')]).mockResolvedValue([]);

    const data = await exportPackOf([
      templateRowToExport({
        title: 'Team Template',
        category: '["ops"]',
        tags: '["team"]',
        user_id: 'creator-1',
        owner_type: 'team',
        team_id: 'team-1',
        slug: 'team-template',
      }),
    ], 'templates/backup?teamId=team-1');

    expectTheOrganizationPlanChecked();
    expect(data.kind).toBe('serplists-template-pack');
    expect(data.templates[0].title).toBe('Team Template');
  });

  describe('an export asked to include public templates, which the page adds from the edge-cached catalog', () => {
    it.each([
      ['Personal', 'templates/backup?includePublic=1'],
      ['Organization', 'templates/backup?includePublic=1&teamId=team-1'],
    ])('reads only the %s templates from D1, never an OR across every public template', async (_label, path) => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([activeMember('editor')]);

      const data = await exportPackOf([templateRowToExport({ title: 'Owned', slug: 'owned' })], path);

      expect(data.templates.map((template) => template.title)).toEqual(['Owned']);
      const dialect = new SQLiteSyncDialect();
      const templateQueries = dbMocks.selectChain.where.mock.calls
        .map(([where]) => dialect.sqlToQuery(where as SQL).sql)
        .filter((whereSql) => whereSql.includes('"templates".'));
      expect(templateQueries).toHaveLength(1);
      expect(templateQueries[0]).toContain('"templates"."owner_type" = ?');
      expect(templateQueries[0]).not.toContain('is_public');
      expect(templateQueries[0]).not.toMatch(/\bor\b/i);
    });
  });

  it('exports stored templates without the run state their sections carry, valid against the JSON Schema and importable again', async () => {
    const data = await exportPackOf([
      templateRowToExport({
        items: JSON.stringify([
          {
            id: 's-1',
            title: 'Checklist',
            items: [
              {
                id: 'i-1',
                title: 'Item',
                isCompleted: false,
                notes: 'run note',
                contents: [
                  { id: 'c-1', type: 'text', value: 'Read me' },
                  { id: 'c-2', type: 'subItems', value: '', subItems: [{ id: 'si-1', title: 'Sub', isCompleted: true }] },
                ],
              },
            ],
          },
        ]),
        rules: null,
        seo_title: '',
        seo_description: '',
      }),
    ]);

    expect(JSON.stringify(data.templates[0].sections)).not.toMatch(/"(isCompleted|completed|notes)"/);
    expect(data.templates[0].sections[0].items[0]).toEqual({
      id: 'i-1',
      title: 'Item',
      contents: [
        { id: 'c-1', type: 'text', value: 'Read me' },
        { id: 'c-2', type: 'subItems', value: '', subItems: [{ id: 'si-1', title: 'Sub' }] },
      ],
    });
    expectValidAgainstThePortableJsonSchema(data);

    const reimport = await importPack(data.templates);
    expect((await readJson(reimport, importBody)).imported).toBe(1);
  });

  it('exports content blocks with a numeric id or null file details, as a lenient JSON import stores them, in the portable format instead of skipping the template', async () => {
    const data = await exportPackOf([
      templateRowToExport({
        title: 'Launch',
        items: JSON.stringify([
          {
            id: 's-1',
            title: 'Prep',
            items: [
              {
                id: 'i-1',
                title: 'Write copy',
                contents: [
                  { id: 1, type: 'file', value: 'https://example.com/a.pdf', fileName: null, fileSize: null, uploadType: null },
                  { id: 'c-2', type: 'image', value: 'https://example.com/b.png', uploadType: 'link' },
                ],
              },
            ],
          },
        ]),
        rules: null,
        slug: 'launch',
        seo_title: '',
        seo_description: '',
      }),
    ]);

    expect(data.manifest.skippedTemplates).toBeUndefined();
    expect(data.templates).toHaveLength(1);
    expect(data.templates[0].sections[0].items[0].contents).toEqual([
      { id: '1', type: 'file', value: 'https://example.com/a.pdf' },
      { id: 'c-2', type: 'image', value: 'https://example.com/b.png' },
    ]);
    expectValidAgainstThePortableJsonSchema(data);
  });
});
