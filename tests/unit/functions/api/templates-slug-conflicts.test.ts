import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { chainSelectsUpdatesAndDeletes } from '../../../support/drizzleChainMocks';

const dbMocks = await vi.hoisted(async () => (await import('../../../support/drizzleChainMocks')).drizzleChainMocks());

vi.mock('drizzle-orm/d1', () => ({ drizzle: vi.fn(() => dbMocks.db) }));
vi.mock('@functions/api/utils/session', () => ({ getSessionUserId: vi.fn() }));
vi.mock('@functions/api/utils/entitlements', () => ({
  getEntitlementsForUser: vi.fn(),
  getEntitlementsForContext: vi.fn(),
}));

import { handleTemplates } from '@functions/api/handlers/templates';
import { getSessionUserId } from '@functions/api/utils/session';
import { getEntitlementsForContext, getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { apiEnv } from '../../../support/apiEnv';
import { apiErrorBody, readJson } from '../../../support/readJson';

const slugBody = z.object({ slug: z.string() }).passthrough();
const importBody = z
  .object({ imported: z.number(), successes: z.array(z.object({ slug: z.string() }).passthrough()) })
  .passthrough();
const importFailedError = apiErrorBody.extend({ details: z.object({ failed: z.array(z.unknown()) }).passthrough() });

const slugTaken = () => new Error('D1_ERROR: UNIQUE constraint failed: templates.slug: SQLITE_CONSTRAINT');
const versionTaken = () => new Error('D1_ERROR: UNIQUE constraint failed: template_versions.template_id, template_versions.version: SQLITE_CONSTRAINT');
const sections = [{ id: 's1', title: 'Weekly', items: [{ id: 'i1', title: 'Review goals' }] }];
const publicSource = {
  id: 'source-1',
  title: 'Weekly Review',
  items: JSON.stringify(sections),
  category: '[]',
  tags: '[]',
  user_id: 'other-user',
  is_public: true,
  slug: 'weekly-review-source',
  version: 1,
};
const env = apiEnv({ BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' });

const post = (path: string, body: unknown) =>
  handleTemplates(new Request(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body) }), env);

const insertedRowsOfEachBatchAttempt = () => {
  const inserted = dbMocks.insertChain.values.mock.calls.map(([values]) => values);
  return Array.from({ length: inserted.length / 3 }, (_, index) => inserted.slice(index * 3, index * 3 + 3));
};

function expectAttemptCarries(attempt: Array<Record<string, string>>, slug: string) {
  const [template, version, audit] = attempt;
  expect(template.slug).toBe(slug);
  expect(JSON.parse(version.snapshot_json).slug).toBe(slug);
  expect(JSON.parse(audit.after_json).slug).toBe(slug);
}

describe('template slugs claimed between the check and the write, which the unique slug index then refuses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chainSelectsUpdatesAndDeletes(dbMocks);
    dbMocks.selectChain.orderBy.mockResolvedValue([]);
    dbMocks.selectChain.limit.mockReset();
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockReturnValue({ kind: 'insert' });
    dbMocks.db.batch.mockReset();
    dbMocks.db.batch.mockResolvedValue([]);
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForUser).mockResolvedValue({ plan: 'pro', limits: { maxTemplates: null, maxActiveRuns: null } });
    vi.mocked(getEntitlementsForContext).mockResolvedValue({ plan: 'team', limits: { maxTemplates: null, maxActiveRuns: null } });
  });

  describe.each([
    ['creating', () => post('/api/templates', { title: 'Weekly Review', sections })],
    ['copying', () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([publicSource]);
      return post('/api/templates/source-1/clone', { visibility: 'private' });
    }],
  ])('%s a template', (_label, send) => {
    it('retries with a fresh slug and returns the slug it saved', async () => {
      dbMocks.db.batch.mockRejectedValueOnce(slugTaken());

      const response = await send();
      const data = await readJson(response, slugBody);

      expect(response.status).toBe(200);
      expect(data.slug).toMatch(/^weekly-review-[0-9a-f]{8}$/);
      expect(dbMocks.db.batch).toHaveBeenCalledTimes(2);
      const [first, second] = insertedRowsOfEachBatchAttempt();
      expectAttemptCarries(first, 'weekly-review');
      expectAttemptCarries(second, data.slug);
      expect(second[0].id).toBe(first[0].id);
    });

    it('answers 409 slug_taken, not a 500, when every attempt collides', async () => {
      dbMocks.db.batch.mockRejectedValue(slugTaken());

      const response = await send();
      const data = await readJson(response, apiErrorBody);

      expect(response.status).toBe(409);
      expect(data.code).toBe('slug_taken');
      expect(dbMocks.db.batch).toHaveBeenCalledTimes(3);
    });

    it('does not retry other database errors', async () => {
      dbMocks.db.batch.mockRejectedValue(new Error('D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT'));

      await expect(send()).rejects.toThrow(/FOREIGN KEY/);
      expect(dbMocks.db.batch).toHaveBeenCalledTimes(1);
    });
  });

  it('imports a template whose slug was claimed mid-import under a fresh slug', async () => {
    dbMocks.db.batch.mockRejectedValueOnce(slugTaken());

    const response = await post('/api/templates/backup', { templates: [{ title: 'Weekly Review', sections }] });
    const data = await readJson(response, importBody);

    expect(response.status).toBe(200);
    expect(data.imported).toBe(1);
    expect(data.successes[0].slug).toMatch(/^weekly-review-[0-9a-f]{8}$/);
    expectAttemptCarries(insertedRowsOfEachBatchAttempt()[1], data.successes[0].slug);
  });

  it('reports a readable import failure when every slug attempt collides', async () => {
    dbMocks.db.batch.mockRejectedValue(slugTaken());

    const response = await post('/api/templates/backup', { templates: [{ title: 'Weekly Review', sections }] });
    const data = await readJson(response, importFailedError);

    expect(response.status).toBe(400);
    expect(data.details.failed).toEqual([expect.objectContaining({ code: 'insert_failed' })]);
    expect(JSON.stringify(data)).not.toMatch(/UNIQUE|SQLITE/);
  });

  describe('changing a template slug', () => {
    const stored = { id: 'template-1', user_id: 'user-123', owner_type: 'user', team_id: null, title: 'Guide', items: '[]', slug: 'my-guide', version: 1, content_version: 1, is_public: false };
    const put = (body: unknown) =>
      handleTemplates(new Request('http://localhost/api/templates/template-1', { method: 'PUT', body: JSON.stringify(body) }), env);

    it('checks the suffixed slug too, and picks another when both are taken', async () => {
      const templateHoldingGuide = [{ id: 'template-2' }];
      const templateHoldingGuideTemplate = [{ id: 'template-3' }];
      dbMocks.selectChain.limit
        .mockResolvedValueOnce([stored])
        .mockResolvedValueOnce(templateHoldingGuide)
        .mockResolvedValueOnce(templateHoldingGuideTemplate);

      const response = await put({ slug: 'guide', expected_version: 1 });
      const data = await readJson(response, slugBody);

      expect(response.status).toBe(200);
      expect(data.slug).toMatch(/^guide-[0-9a-f]{8}$/);
      expect(dbMocks.updateChain.set.mock.calls[0][0].slug).toBe(data.slug);
    });

    it('answers 409 slug_taken when every candidate is taken', async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([stored]).mockResolvedValue([{ id: 'template-2' }]);

      const response = await put({ slug: 'guide', expected_version: 1 });
      const data = await readJson(response, apiErrorBody);

      expect(response.status).toBe(409);
      expect(data.code).toBe('slug_taken');
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });

    it('answers 409 slug_taken when another save claims the slug before this one writes', async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([stored]);
      dbMocks.db.batch.mockRejectedValue(slugTaken());

      const response = await put({ slug: 'guide', expected_version: 1 });
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data).toEqual(expect.objectContaining({ code: 'slug_taken', details: { slug: 'guide' } }));
    });

    it('still reports a concurrent version as an edit conflict', async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([stored]);
      dbMocks.db.batch.mockRejectedValue(versionTaken());

      const response = await put({ title: 'Guide v2', expected_version: 1 });
      const data = await readJson(response, apiErrorBody);

      expect(response.status).toBe(409);
      expect(data.code).toBe('edit_conflict');
    });
  });
});
