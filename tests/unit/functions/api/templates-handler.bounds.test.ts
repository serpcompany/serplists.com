import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dbMocks, importBody, mockEnv, PRO_PLAN, resetTemplatesHandlerMocks, slugBody } from '../../../support/templatesHandler';
import { handleTemplates } from '@functions/api/handlers/templates';
import { getSessionUserId } from '@functions/api/utils/session';
import { getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { personalTemplateRow } from '../../../fixtures/handlerRows';
import { sectionsWithContents } from '../../../fixtures/malformedSections';
import { apiRequest } from '../../../support/apiRequest';
import { apiErrorBody, readJson } from '../../../support/readJson';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const send = (path: string, method: string, body: Record<string, unknown>) =>
  handleTemplates(apiRequest(path, method, body), mockEnv);

async function expectRejectedNaming(response: Response, path: string) {
  const data = await readJson(response, apiErrorBody);

  expect(response.status).toBe(400);
  expect(data.error.startsWith(`${path}: `)).toBe(true);
}

async function expectASlugWithin160Characters(response: Response) {
  const data = await readJson(response, slugBody);

  expect(response.status).toBe(200);
  expect(data.slug.length).toBeLessThanOrEqual(160);
  expect(data.slug).toMatch(SLUG_PATTERN);
}

function signInOnTheProPlan() {
  vi.mocked(getSessionUserId).mockResolvedValue('user-123');
  vi.mocked(getEntitlementsForUser).mockResolvedValue(PRO_PLAN);
}

describe('Templates Handlers', () => {
  beforeEach(resetTemplatesHandlerMocks);

  describe('malformed checklist content', () => {
    const malformed: Array<[string, unknown, string]> = [
      ['a string Sub-task list', { type: 'subItems', value: '', subItems: 'x' }, 'sections[0].items[0].contents[0].subItems'],
      ['an object Sub-task list', { type: 'subItems', value: '', subItems: {} }, 'sections[0].items[0].contents[0].subItems'],
      ['an object value', { type: 'text', value: {} }, 'sections[0].items[0].contents[0].value'],
      ['an unknown type', { type: 'poll', value: 'x' }, 'sections[0].items[0].contents[0].type'],
    ];

    it.each(malformed)('POST rejects %s, naming the field, and stores nothing', async (_label, content, path) => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      dbMocks.selectChain.limit.mockResolvedValue([]);

      await expectRejectedNaming(await send('templates', 'POST', { title: 'Launch plan', sections: sectionsWithContents(content) }), path);
      expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });

    it.each(malformed)('PUT rejects %s before any template or run is written', async (_label, content, path) => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');

      await expectRejectedNaming(
        await send('templates/template-1', 'PUT', { sections: sectionsWithContents(content), expected_version: 1 }),
        path,
      );
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
      expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    });

    it('still accepts a title-only save of a template whose stored content is malformed', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalTemplateRow({
        title: 'Old title',
        items: JSON.stringify(sectionsWithContents({ type: 'subItems', value: '', subItems: 'x' })),
        version: 1,
        content_version: 1,
        slug: 'old-title',
      })]);

      const response = await send('templates/template-1', 'PUT', { title: 'New title', expected_version: 1 });

      expect(response.status).toBe(200);
    });

    it('fails only the imported template with malformed content, naming the field', async () => {
      signInOnTheProPlan();
      dbMocks.selectChain.limit.mockResolvedValue([]);

      const response = await send('templates/backup', 'POST', { templates: [
        { title: 'Broken', sections: sectionsWithContents({ type: 'subItems', value: '', subItems: 'x' }) },
        { title: 'Fine', sections: sectionsWithContents({ type: 'subItems', value: '', subItems: [{ title: 'Short' }] }) },
      ] });
      const data = await readJson(response, importBody);

      expect(response.status).toBe(200);
      expect(data.imported).toBe(1);
      expect(data.failed).toEqual([expect.objectContaining({
        title: 'Broken',
        code: 'invalid_sections',
        reason: 'sections[0].items[0].contents[0].subItems: Expected array, received string',
      })]);
    });
  });

  describe('rows that every later save must be able to resend', () => {
    it.each([
      ['a 155-character title', 'a'.repeat(155)],
      ['a 160-character title ending near a word break', `${'word '.repeat(31)}tail`],
      ['a 300-character title', 'Checklist '.repeat(30)],
    ])('keeps a colliding clone slug within 160 characters for %s', async (_label, title) => {
      signInOnTheProPlan();
      dbMocks.selectChain.limit
        .mockResolvedValueOnce([{ id: 'template-1', title, items: '[]', category: '[]', tags: '[]', user_id: 'other-user', is_public: true, slug: 'source', version: 1 }])
        .mockResolvedValueOnce([{ id: 'template-1' }])
        .mockResolvedValueOnce([]);

      await expectASlugWithin160Characters(await send('templates/template-1/clone', 'POST', { visibility: 'private' }));
    });

    it('accepts a save that resends a legacy slug and stored values that predate the bounds', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      const legacy = {
        id: 'template-1',
        user_id: 'user-123',
        owner_type: 'user',
        team_id: null,
        title: 'T'.repeat(170),
        description: 'd'.repeat(6000),
        seo_description: 's'.repeat(400),
        rules: JSON.stringify([{ id: '', type: 'required-field', path: 'title', severity: 'error' }]),
        items: '[]',
        category: '[]',
        tags: '[]',
        slug: 'seo-checklist:-2024',
        version: 2,
        content_version: 1,
        is_public: false,
      };
      dbMocks.selectChain.limit.mockResolvedValueOnce([legacy]);

      const response = await send('templates/template-1', 'PUT', {
        title: legacy.title,
        description: legacy.description,
        seoDescription: legacy.seo_description,
        rules: [{ id: '', type: 'required-field', path: 'title', severity: 'error' }],
        slug: legacy.slug,
        is_public: true,
        expected_version: 2,
      });

      expect(response.status).toBe(200);
      const templateUpdate = dbMocks.updateChain.set.mock.calls[0][0];
      expect(templateUpdate).toEqual(expect.objectContaining({ is_public: true }));
      expect(templateUpdate).not.toHaveProperty('slug');
      expect(templateUpdate).not.toHaveProperty('description');
    });

    it('rejects a changed value over its bound and names the field', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      dbMocks.selectChain.limit.mockResolvedValueOnce([
        personalTemplateRow({ title: 'Plan', description: '', items: '[]', version: 1, is_public: false }),
      ]);

      const response = await send('templates/template-1', 'PUT', { description: 'd'.repeat(5001), expected_version: 1 });
      const data = await readJson(response, apiErrorBody);

      expect(response.status).toBe(400);
      expect(data.error).toMatch(/^description: /);
      expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    });

    it('keeps a suffixed slug within 160 characters when the requested slug is taken', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      dbMocks.selectChain.limit
        .mockResolvedValueOnce([personalTemplateRow({ title: 'Plan', items: '[]', slug: 'plan', version: 1, is_public: false })])
        .mockResolvedValueOnce([{ id: 'template-2' }]);

      await expectASlugWithin160Characters(await send('templates/template-1', 'PUT', { slug: 'b'.repeat(160), expected_version: 1 }));
    });

    it('fails only the imported templates whose fields exceed the bounds, naming the field', async () => {
      signInOnTheProPlan();
      const sections = [{ id: 's-1', title: 'Checklist', items: [{ id: 'i-1', title: 'Item' }] }];

      const response = await send('templates/backup', 'POST', {
        templates: [
          { title: 'Valid', sections },
          { title: 'x'.repeat(161), sections },
          { title: 'Long description', description: 'd'.repeat(5001), sections },
          { title: 'Blank rule', rules: [{ id: '', type: 'required-field', path: 'title' }], sections },
          { title: '   ', sections },
        ],
      });
      const data = await readJson(response, importBody);

      expect(response.status).toBe(200);
      expect(data.imported).toBe(1);
      expect(data.failed.map((failure: { index: number; code: string; reason: string }) => [failure.index, failure.code, failure.reason.split(':')[0]]))
        .toEqual([[1, 'invalid_fields', 'title'], [2, 'invalid_fields', 'description'], [3, 'invalid_fields', 'rules.0.id'], [4, 'invalid_fields', 'title']]);
    });
  });
});
