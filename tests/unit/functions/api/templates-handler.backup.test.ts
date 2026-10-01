import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { dbMocks, importBody, mockEnv, resetTemplatesHandlerMocks } from '../../../support/templatesHandler';
import { handleTemplates } from '@functions/api/handlers/templates';
import { getSessionUserId } from '@functions/api/utils/session';
import { getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { apiErrorBody, readJson } from '../../../support/readJson';

const exportBody = z.object({ templates: z.array(z.record(z.unknown())) }).passthrough();
const importFailedError = apiErrorBody.extend({
  details: z.object({ imported: z.number(), failed: z.array(z.unknown()) }).passthrough(),
});

describe('Templates Handlers', () => {
  beforeEach(resetTemplatesHandlerMocks);

  it('should reject template backup export for free users', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');

    const request = new Request('http://localhost/api/templates/backup', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(403);
    expect(data.code).toBe('upgrade_required');
  });

  it('should export backup format for pro users when requested', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForUser).mockResolvedValue({
      plan: 'pro',
      limits: { maxTemplates: null, maxActiveRuns: null },
    });

    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: 'template-1',
        title: 'Template',
        description: '',
        items: JSON.stringify([{ id: 's-1', title: 'Checklist', items: [{ id: 'i-1', title: 'Item' }] }]),
        category: '["seo"]',
        tags: '["tag-1"]',
        user_id: 'user-123',
        is_public: 0,
        slug: 'template',
        created_at: new Date().toISOString(),
        updated_at: null,
        version: 1,
      },
    ]);

    const request = new Request('http://localhost/api/templates/backup?format=backup', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, exportBody);

    expect(response.status).toBe(200);
    expect(data.version).toBe('1.0.0');
    expect(Array.isArray(data.templates)).toBe(true);
    expect(data.templates[0].version).toBe(1);
  });

  it('should import templates from backup for pro users', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForUser).mockResolvedValue({
      plan: 'pro',
      limits: { maxTemplates: null, maxActiveRuns: null },
    });
    dbMocks.selectChain.limit.mockResolvedValue([]);

    const request = new Request('http://localhost/api/templates/backup', {
      method: 'POST',
      body: JSON.stringify({
        templates: [
          {
            title: 'Imported',
            sections: [{ id: 's-1', title: 'Checklist', items: [{ id: 'i-1', title: 'Item' }] }],
            isPublic: false,
          },
        ],
        options: { visibility: 'private' },
      }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, importBody);

    expect(response.status).toBe(200);
    expect(data.total).toBe(1);
    expect(data.imported).toBe(1);
    expect(data.failed).toEqual([]);
    expect(data.successes).toEqual([
      expect.objectContaining({
        index: 0,
        title: 'Imported',
        visibility: 'private',
      }),
    ]);
    expect(dbMocks.db.batch).toHaveBeenCalled();
    expect(dbMocks.db.batch.mock.calls[0][0]).toHaveLength(3);
    expect(dbMocks.insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'template.imported',
        resource_type: 'template',
      }),
    );
    const importedTemplate = dbMocks.insertChain.values.mock.calls
      .map(([values]) => values)
      .find((values) => values?.title === 'Imported' && 'slug' in values);
    expect(importedTemplate?.updated_at).toEqual(expect.any(String));
    expect(importedTemplate?.updated_at).toBe(importedTemplate?.created_at);
  });

  it('should return per-template partial import results when some templates fail', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForUser).mockResolvedValue({
      plan: 'pro',
      limits: { maxTemplates: null, maxActiveRuns: null },
    });
    dbMocks.selectChain.limit.mockResolvedValue([]);

    const request = new Request('http://localhost/api/templates/backup', {
      method: 'POST',
      body: JSON.stringify({
        templates: [
          {
            title: 'Imported',
            sections: [{ id: 's-1', title: 'Checklist', items: [{ id: 'i-1', title: 'Item' }] }],
            isPublic: false,
          },
          {
            title: 'Broken Template',
            sections: 'not-json',
            isPublic: false,
          },
        ],
        options: { visibility: 'private' },
      }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, importBody);

    expect(response.status).toBe(200);
    expect(data.total).toBe(2);
    expect(data.imported).toBe(1);
    expect(data.successes).toHaveLength(1);
    expect(data.failed).toEqual([
      expect.objectContaining({
        index: 1,
        title: 'Broken Template',
        code: 'invalid_sections',
      }),
    ]);
  });

  it('rejects imported sections, tasks or sub-tasks that are not objects, naming them as a person reads the file, not as a JSON path', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForUser).mockResolvedValue({
      plan: 'pro',
      limits: { maxTemplates: null, maxActiveRuns: null },
    });
    dbMocks.selectChain.limit.mockResolvedValue([]);

    const request = new Request('http://localhost/api/templates/backup', {
      method: 'POST',
      body: JSON.stringify({
        templates: [
          { title: 'Text tasks', sections: [{ id: 's-1', title: 'Shop', items: ['Milk', 'Eggs'] }] },
          { title: 'Flat text tasks', items: ['Milk'] },
          { title: 'Null task', sections: [{ id: 's-1', title: 'Shop', items: [{ id: 'i-1', title: 'Milk' }, null] }] },
          { title: 'Text section', sections: [{ id: 's-1', title: 'Shop', items: [] }, 'Bakery'] },
          {
            title: 'Text sub-task',
            sections: [{
              id: 's-1',
              title: 'Shop',
              items: [{ id: 'i-1', title: 'Dairy', contents: [{ id: 'c-1', type: 'subItems', value: '', subItems: ['Milk'] }] }],
            }],
          },
        ],
      }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, importFailedError);

    expect(response.status).toBe(400);
    expect(data.code).toBe('template_import_failed');
    expect(data.details.imported).toBe(0);
    expect(data.details.failed).toEqual([
      expect.objectContaining({ index: 0, code: 'invalid_sections', reason: expect.stringMatching(/task 1 in section 1/i) }),
      expect.objectContaining({ index: 1, code: 'invalid_sections', reason: expect.stringMatching(/task 1 in section 1/i) }),
      expect.objectContaining({ index: 2, code: 'invalid_sections', reason: expect.stringMatching(/task 2 in section 1/i) }),
      expect.objectContaining({ index: 3, code: 'invalid_sections', reason: expect.stringMatching(/section 2/i) }),
      expect.objectContaining({ index: 4, code: 'invalid_sections', reason: expect.stringMatching(/sub-task 1 of task 1 in section 1/i) }),
    ]);
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });

  it('should return structured failure details when all imported templates fail', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForUser).mockResolvedValue({
      plan: 'pro',
      limits: { maxTemplates: null, maxActiveRuns: null },
    });

    const request = new Request('http://localhost/api/templates/backup', {
      method: 'POST',
      body: JSON.stringify({
        templates: [
          {
            title: 'Broken Template A',
            sections: 'not-json',
          },
          {
            title: 'Broken Template B',
            sections: 'still-not-json',
          },
        ],
      }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(400);
    expect(data.code).toBe('template_import_failed');
    expect(data.details).toEqual(
      expect.objectContaining({
        total: 2,
        imported: 0,
        failed: [
          expect.objectContaining({ title: 'Broken Template A', code: 'invalid_sections' }),
          expect.objectContaining({ title: 'Broken Template B', code: 'invalid_sections' }),
        ],
      }),
    );
  });

  it('reports a failed template insert with a readable reason, not the database error', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForUser).mockResolvedValue({ plan: 'pro', limits: { maxTemplates: null, maxActiveRuns: null } });
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.db.batch.mockRejectedValue(new Error('D1_ERROR: string or blob too big: SQLITE_TOOBIG'));

    const response = await handleTemplates(new Request('http://localhost/api/templates/backup', {
      method: 'POST',
      body: JSON.stringify({ templates: [{ title: 'Huge', sections: [{ id: 's1', title: 'S', items: [{ id: 'i1', title: 'T' }] }] }] }),
    }), mockEnv);
    const data = await readJson(response, importFailedError);

    expect(response.status).toBe(400);
    expect(data.details.failed).toEqual([expect.objectContaining({
      title: 'Huge',
      code: 'insert_failed',
      reason: 'Could not save this template. Try importing it again.',
    })]);
    expect(JSON.stringify(data)).not.toContain('SQLITE');
  });
});
