import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { dbMocks, mockEnv, resetTemplatesHandlerMocks, slugBody } from '../../../support/templatesHandler';
import { handleTemplates } from '@functions/api/handlers/templates';
import { getSessionUserId } from '@functions/api/utils/session';
import { columnNamesIn } from '../../../support/drizzleSql';
import { jsonObject, jsonObjects, readJson } from '../../../support/readJson';

const templateListBody = z.array(
  z.object({ sections: z.array(z.object({ items: z.array(z.unknown()) }).passthrough()) }).passthrough(),
);
const templateOrList = z.union([jsonObjects, jsonObject]);

describe('Templates Handlers', () => {
  beforeEach(resetTemplatesHandlerMocks);

  it('should list templates and normalize legacy items', async () => {
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: 'template-1',
        title: 'Legacy Template',
        items: JSON.stringify([{ id: 'item-1', title: 'Item 1' }]),
        category: '["seo"]',
        tags: '["tag-1"]',
        user_id: 'user-1',
        is_public: 1,
        owner_username: 'alice',
        owner_full_name: 'Alice Example',
      },
    ]);

    const request = new Request('http://localhost/api/templates', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, templateListBody);

    expect(response.status).toBe(200);
    expect(data[0].sections).toHaveLength(1);
    expect(data[0].sections[0].items).toHaveLength(1);
    expect(data[0].categories).toEqual(['seo']);
    expect(data[0].tags).toEqual(['tag-1']);
    expect(data[0].ownerProfile).toEqual({
      username: 'alice',
      full_name: 'Alice Example',
    });
  });

  describe('template read responses', () => {
    const sections = [{ id: 's1', title: 'Launch', items: [{ id: 'i1', title: 'Check DNS' }] }];
    const row = (items: string) => ({
      id: 'template-1',
      title: 'Plan',
      items,
      category: '[]',
      tags: '[]',
      user_id: 'user-123',
      owner_type: 'user',
      team_id: null,
      is_public: 1,
      slug: 'plan',
    });
    const membership = { id: 'member-1', team_id: 'org-1', user_id: 'user-123', role: 'viewer', status: 'active' };
    const readRoutes: Array<[string, string, 'list' | 'organization-list' | 'detail']> = [
      ['the public catalog', '/api/templates?scope=public', 'list'],
      ['Personal templates', '/api/templates?scope=personal', 'list'],
      ['the unscoped list', '/api/templates', 'list'],
      ['Organization templates', '/api/templates?teamId=org-1', 'organization-list'],
      ['a Public Profile', '/api/templates/public?userId=user-123', 'list'],
      ['archived Personal templates', '/api/templates/archived', 'list'],
      ['archived Organization templates', '/api/templates/archived?teamId=org-1', 'organization-list'],
      ['a template by slug', '/api/templates/slug/plan', 'detail'],
      ['a template by id', '/api/templates/template-1', 'detail'],
    ];
    const read = async (path: string, kind: string, items: string) => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      if (kind === 'organization-list') dbMocks.selectChain.limit.mockResolvedValueOnce([membership]);
      if (kind === 'detail') dbMocks.selectChain.limit.mockResolvedValueOnce([row(items)]);
      else dbMocks.selectChain.orderBy.mockResolvedValueOnce([row(items)]);
      const response = await handleTemplates(new Request(`http://localhost${path}`), mockEnv);
      expect(response.status).toBe(200);
      const data = await readJson(response, templateOrList);
      return Array.isArray(data) ? data[0] : data;
    };

    it.each(readRoutes)('%s sends parsed sections without the raw items column', async (_label, path, kind) => {
      const template = await read(path, kind, JSON.stringify(sections));

      expect(template).not.toHaveProperty('items');
      expect(template.sections).toEqual(sections);
    });

    it('still wraps a legacy flat row into sections', async () => {
      const template = await read('/api/templates/template-1', 'detail', JSON.stringify([{ id: 'i1', title: 'Check DNS' }]));

      expect(template).not.toHaveProperty('items');
      expect(template.sections).toEqual([{ id: '1', title: 'Checklist', items: [{ id: 'i1', title: 'Check DNS' }] }]);
    });

    it('sends empty sections, not the raw column, for a row that does not parse', async () => {
      const template = await read('/api/templates/template-1', 'detail', '{not json');

      expect(template).not.toHaveProperty('items');
      expect(template.sections).toEqual([]);
    });
  });

  it('should scope authenticated template lists to public or personal-owned templates', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([]);

    const request = new Request('http://localhost/api/templates', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);
    const predicate = dbMocks.selectChain.where.mock.calls[0][0];
    const columnNames = columnNamesIn(predicate);

    expect(response.status).toBe(200);
    expect(columnNames).toContain('is_public');
    expect(columnNames).toContain('owner_type');
    expect(columnNames).toContain('user_id');
    expect(columnNames).toContain('team_id');
    expect(columnNames).toContain('deleted_at');
  });

  it('should scope public profile template lists to personal-owned public templates', async () => {
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([]);

    const request = new Request('http://localhost/api/templates/public?userId=user-123', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);
    const predicate = dbMocks.selectChain.where.mock.calls[0][0];
    const columnNames = columnNamesIn(predicate);

    expect(response.status).toBe(200);
    expect(columnNames).toContain('owner_type');
    expect(columnNames).toContain('user_id');
    expect(columnNames).toContain('team_id');
    expect(columnNames).toContain('is_public');
    expect(columnNames).toContain('deleted_at');
  });

  it('should list team templates for active team members', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'viewer', status: 'active' },
    ]);
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: 'template-1',
        title: 'Team Template',
        items: JSON.stringify([{ id: 'section-1', title: 'Checklist', items: [] }]),
        user_id: 'creator-1',
        owner_type: 'team',
        team_id: 'team-1',
        is_public: 0,
      },
    ]);

    const request = new Request('http://localhost/api/templates?teamId=team-1', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, jsonObjects);

    expect(response.status).toBe(200);
    expect(data[0].id).toBe('template-1');
    expect(data[0].team_id).toBe('team-1');
  });

  it('should return saved SEO metadata in template responses', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'template-1',
        title: 'SEO Template',
        description: 'Stored template',
        items: JSON.stringify([{ id: 'section-1', title: 'Checklist', items: [] }]),
        category: '["seo"]',
        tags: '["content"]',
        user_id: 'user-1',
        is_public: 1,
        slug: 'seo-template',
        seo_title: 'Stored SEO Title',
        seo_description: 'Stored SEO description',
        rules: JSON.stringify([
          {
            id: 'rule-1',
            type: 'required-field',
            path: 'sections[].items[].title',
            value: 'Every item needs a title',
            severity: 'error',
          },
        ]),
        type: 'checklist',
      },
    ]);

    const request = new Request('http://localhost/api/templates/template-1', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, slugBody);

    expect(response.status).toBe(200);
    expect(data.slug).toBe('seo-template');
    expect(data.seoTitle).toBe('Stored SEO Title');
    expect(data.seoDescription).toBe('Stored SEO description');
    expect(data.rules).toHaveLength(1);
  });
});
