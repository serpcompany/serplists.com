import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonObject, readJson } from '../../../support/readJson';
import { chainSelectsUpdatesAndDeletes } from '../../../support/drizzleChainMocks';

const dbMocks = await vi.hoisted(async () => (await import('../../../support/drizzleChainMocks')).drizzleChainMocks());

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => dbMocks.db),
}));

vi.mock('@functions/api/utils/session', () => ({
  getSessionUserId: vi.fn(),
}));

import { handleTemplates } from '@functions/api/handlers/templates';
import { getSessionUserId } from '@functions/api/utils/session';

const mockEnv = {
  DB: {},
  BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
};

const existingTemplate = {
  id: 'template-1',
  user_id: 'user-123',
  title: 'Existing Template',
  description: '',
  items: '[]',
  version: 3,
  content_version: 3,
  is_public: false,
  slug: 'existing-template',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: null,
};

const put = async (body: Record<string, unknown>) => {
  const response = await handleTemplates(
    new Request('http://localhost/api/templates/template-1', { method: 'PUT', body: JSON.stringify(body) }),
    mockEnv as never,
  );
  return { status: response.status, data: await readJson(response, jsonObject) };
};

describe('PUT /api/templates/:id response, which names the version and slug it stored so the editor\'s next save needs no list reload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.limit.mockReset();
    chainSelectsUpdatesAndDeletes(dbMocks);
    dbMocks.selectChain.orderBy.mockResolvedValue([]);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockResolvedValue(undefined);
    dbMocks.insertChain.select.mockReturnValue({ kind: 'conditional-insert' });
    dbMocks.db.batch.mockResolvedValue([]);
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
  });

  it('returns the new version and the stored slug after a content edit', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([existingTemplate]);

    const { status, data } = await put({ title: 'Renamed Template', expected_version: 3 });

    expect(status).toBe(200);
    expect(data).toMatchObject({ success: true, version: 4, slug: 'existing-template' });
  });

  it('returns the unchanged version when the edit does not create one', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([existingTemplate]);

    const saveThatStoresNothingNew = { title: 'Existing Template', expected_version: 3 };
    const { status, data } = await put(saveThatStoresNothingNew);

    expect(status).toBe(200);
    expect(data).toMatchObject({ success: true, version: 3, slug: 'existing-template' });
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });

  it('returns the suffixed slug it stored when the requested one was taken', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([existingTemplate])
      .mockResolvedValueOnce([{ id: 'another-template' }]);

    const { status, data } = await put({ title: 'Existing Template', slug: 'taken-slug', expected_version: 3 });

    expect(status).toBe(200);
    expect(data).toMatchObject({ success: true, version: 4, slug: 'taken-slug-template' });
  });
});
