import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dbMocks,
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
import { getEntitlementsForContext } from '@functions/api/utils/entitlements';
import { readJson } from '../../../support/readJson';

describe('portable template import/export API', () => {
  beforeEach(resetPortableTemplatesHandlerMocks);

  it('exports portable template packs by default', async () => {
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: 'template-1',
        title: 'Template',
        description: '',
        items: JSON.stringify([{ id: 's-1', title: 'Checklist', items: [{ id: 'i-1', title: 'Item' }] }]),
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
        user_id: 'user-123',
        is_public: 1,
        slug: 'template',
        seo_title: 'SEO Title',
        seo_description: 'SEO Description',
        created_at: new Date().toISOString(),
        updated_at: null,
        version: 1,
      },
    ]);

    const request = new Request('http://localhost/api/templates/backup', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, packBody);

    expect(response.status).toBe(200);
    expect(data.kind).toBe('serplists-template-pack');
    expect(data.schemaVersion).toBe('2.0.0');
    expect(data.templates[0].visibility).toBe('public');
    expect(data.templates[0].seoTitle).toBe('SEO Title');
    expect(data.templates[0].seoDescription).toBe('SEO Description');
    expect(data.templates[0].rules).toHaveLength(1);
    expect(data.manifest.includesRules).toBe(true);
  });

  it('exports portable template packs for paid team workspaces', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'editor', status: 'active' },
    ]).mockResolvedValue([]);
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: 'template-1',
        title: 'Team Template',
        description: '',
        items: JSON.stringify([{ id: 's-1', title: 'Checklist', items: [{ id: 'i-1', title: 'Item' }] }]),
        category: '["ops"]',
        tags: '["team"]',
        user_id: 'creator-1',
        owner_type: 'team',
        team_id: 'team-1',
        is_public: 0,
        slug: 'team-template',
        created_at: new Date().toISOString(),
        updated_at: null,
        version: 1,
      },
    ]);

    const request = new Request('http://localhost/api/templates/backup?teamId=team-1', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, packBody);

    expect(response.status).toBe(200);
    expect(vi.mocked(getEntitlementsForContext)).toHaveBeenCalledWith(
      mockEnv,
      expect.objectContaining({ type: 'team', teamId: 'team-1', userId: 'user-123' }),
    );
    expect(data.kind).toBe('serplists-template-pack');
    expect(data.templates[0].title).toBe('Team Template');
  });

  describe('an export asked to include public templates, which the page adds from the edge-cached catalog', () => {
    it.each([
      ['Personal', '/api/templates/backup?includePublic=1'],
      ['Organization', '/api/templates/backup?includePublic=1&teamId=team-1'],
    ])('reads only the %s templates from D1, never an OR across every public template', async (_label, path) => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([
        { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'editor', status: 'active' },
      ]);
      dbMocks.selectChain.orderBy.mockResolvedValueOnce([
        {
          id: 'template-1',
          title: 'Owned',
          description: '',
          items: JSON.stringify([{ id: 's-1', title: 'Checklist', items: [{ id: 'i-1', title: 'Item' }] }]),
          category: '[]',
          tags: '[]',
          user_id: 'user-123',
          is_public: 0,
          slug: 'owned',
          created_at: new Date().toISOString(),
          version: 1,
        },
      ]);

      const response = await handleTemplates(new Request(`http://localhost${path}`), mockEnv);
      const data = await readJson(response, packBody);

      expect(response.status).toBe(200);
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
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: 'template-1',
        title: 'Template',
        description: '',
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
        category: '[]',
        tags: '[]',
        user_id: 'user-123',
        is_public: 0,
        slug: 'template',
        seo_title: '',
        seo_description: '',
        created_at: new Date().toISOString(),
        updated_at: null,
        version: 1,
      },
    ]);

    const response = await handleTemplates(
      new Request('http://localhost/api/templates/backup', { method: 'GET' }),
      mockEnv,
    );
    const data = await readJson(response, packBody);

    expect(response.status).toBe(200);
    expect(JSON.stringify(data.templates[0].sections)).not.toMatch(/"(isCompleted|completed|notes)"/);
    expect(data.templates[0].sections[0].items[0]).toEqual({
      id: 'i-1',
      title: 'Item',
      contents: [
        { id: 'c-1', type: 'text', value: 'Read me' },
        { id: 'c-2', type: 'subItems', value: '', subItems: [{ id: 'si-1', title: 'Sub' }] },
      ],
    });
    const validate = new Ajv({ strict: false }).compile(buildPortableTemplatePackJsonSchema());
    expect(validate(data), JSON.stringify(validate.errors)).toBe(true);

    const reimport = await importPack(data.templates);
    expect((await readJson(reimport, importBody)).imported).toBe(1);
  });

  it('exports content blocks with a numeric id or null file details, as a lenient JSON import stores them, in the portable format instead of skipping the template', async () => {
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: 'template-1',
        title: 'Launch',
        description: '',
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
        category: '[]',
        tags: '[]',
        user_id: 'user-123',
        is_public: 0,
        slug: 'launch',
        seo_title: '',
        seo_description: '',
        created_at: new Date().toISOString(),
        updated_at: null,
        version: 1,
      },
    ]);

    const response = await handleTemplates(
      new Request('http://localhost/api/templates/backup', { method: 'GET' }),
      mockEnv,
    );
    const data = await readJson(response, packBody);

    expect(response.status).toBe(200);
    expect(data.manifest.skippedTemplates).toBeUndefined();
    expect(data.templates).toHaveLength(1);
    expect(data.templates[0].sections[0].items[0].contents).toEqual([
      { id: '1', type: 'file', value: 'https://example.com/a.pdf' },
      { id: 'c-2', type: 'image', value: 'https://example.com/b.png' },
    ]);
    const validate = new Ajv({ strict: false }).compile(buildPortableTemplatePackJsonSchema());
    expect(validate(data), JSON.stringify(validate.errors)).toBe(true);
  });
});
