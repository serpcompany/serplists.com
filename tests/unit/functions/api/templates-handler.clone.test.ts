import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createdBody, dbMocks, mockEnv, resetTemplatesHandlerMocks } from '../../../support/templatesHandler';
import { handleTemplates } from '@functions/api/handlers/templates';
import { getSessionUserId } from '@functions/api/utils/session';
import { getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { apiErrorBody, readJson } from '../../../support/readJson';

describe('Templates Handlers', () => {
  beforeEach(resetTemplatesHandlerMocks);

  describe('copying a public template', () => {
    const publicSource = {
      id: 'template-1',
      title: 'Public Template',
      description: '',
      items: JSON.stringify([]),
      category: '[]',
      tags: '[]',
      user_id: 'other-user',
      is_public: true,
      slug: 'public-template',
      created_at: new Date().toISOString(),
      updated_at: null,
      version: 1,
    };
    const editor = { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'editor', status: 'active' };
    const clone = (body: Record<string, unknown>) => handleTemplates(new Request('http://localhost/api/templates/template-1/clone', {
      method: 'POST',
      body: JSON.stringify(body),
    }), mockEnv);

    afterEach(() => {
      dbMocks.selectChain.limit.mockReset();
    });

    it.each([
      ['a Free user', { plan: 'free' as const, source: 'free' as const }],
      ['a user whose Personal override is not Pro', { plan: 'free' as const, source: 'user_override' as const }],
    ])('asks %s to upgrade before copying into Personal, and reads or writes nothing', async (_label, entitlement) => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      vi.mocked(getEntitlementsForUser).mockResolvedValue({ ...entitlement, limits: { maxTemplates: 1, maxActiveRuns: 3 } });
      dbMocks.selectChain.limit.mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([publicSource]);

      const response = await clone({ visibility: 'private' });
      const data = await readJson(response, apiErrorBody);

      expect(response.status).toBe(403);
      expect(data.code).toBe('upgrade_required');
      expect(dbMocks.selectChain.limit).not.toHaveBeenCalled();
      expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });

    it('lets a Free user copy into a Free Organization they edit while it is under its limit', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      dbMocks.selectChain.limit
        .mockResolvedValueOnce([editor])
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([publicSource])
        .mockResolvedValueOnce([]);

      const response = await clone({ visibility: 'private', teamId: 'team-1' });
      const data = await readJson(response, createdBody);

      expect(response.status).toBe(200);
      expect(data.id).toBeDefined();
      expect(vi.mocked(getEntitlementsForUser)).not.toHaveBeenCalled();
      expect(dbMocks.insertChain.values.mock.calls[0][0]).toEqual(expect.objectContaining({ owner_type: 'team', team_id: 'team-1' }));
    });

    it('stops a copy into a Free Organization at its template limit', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      dbMocks.selectChain.limit.mockResolvedValueOnce([editor]).mockResolvedValueOnce([{ count: 1 }]);

      const response = await clone({ visibility: 'private', teamId: 'team-1' });
      const data = await readJson(response, apiErrorBody);

      expect(response.status).toBe(403);
      expect(data.code).toBe('limit_reached');
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });

    it('starts the copy at version 1, keeping the source counters only as provenance', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      vi.mocked(getEntitlementsForUser).mockResolvedValue({ plan: 'pro', limits: { maxTemplates: null, maxActiveRuns: null } });
      dbMocks.selectChain.limit.mockResolvedValueOnce([{ ...publicSource, version: 37, content_version: 12 }]).mockResolvedValueOnce([]);

      const response = await clone({ visibility: 'private' });

      expect(response.status).toBe(200);
      const inserted = dbMocks.insertChain.values.mock.calls.map(([values]) => values);
      const templateRow = inserted.find((values) => 'owner_type' in values);
      const versionRow = inserted.find((values) => 'snapshot_json' in values);
      const auditRow = inserted.find((values) => values.action === 'template.cloned');
      expect(templateRow).toEqual(expect.objectContaining({ version: 1, content_version: 1 }));
      expect(versionRow).toEqual(expect.objectContaining({ version: 1, change_summary: 'template.cloned' }));
      expect(JSON.parse(versionRow.snapshot_json)).toEqual(expect.objectContaining({ version: 1, content_version: 1 }));
      expect(JSON.parse(auditRow.metadata_json)).toEqual({ sourceTemplateId: 'template-1', sourceVersion: 37, sourceContentVersion: 12 });
    });
  });

  it('clones a public template for Pro users, whose copies no template count limits', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForUser).mockResolvedValue({
      plan: 'pro',
      limits: { maxTemplates: null, maxActiveRuns: null },
    });
    const templatesHoldingTheBaseSlug: never[] = [];
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'template-1',
        title: 'Public Template',
        description: '',
        items: JSON.stringify([]),
        category: '[]',
        tags: '[]',
        user_id: 'other-user',
        is_public: true,
        slug: 'public-template',
        created_at: new Date().toISOString(),
        updated_at: null,
        version: 1,
      },
    ]).mockResolvedValueOnce(templatesHoldingTheBaseSlug);

    const request = new Request('http://localhost/api/templates/template-1/clone', {
      method: 'POST',
      body: JSON.stringify({ visibility: 'private' }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, createdBody);

    expect(response.status).toBe(200);
    expect(data.id).toBeDefined();
    const clonedTemplate = dbMocks.insertChain.values.mock.calls
      .map(([values]) => values)
      .find((values) => values?.id === data.id && 'slug' in values);
    expect(clonedTemplate?.updated_at).toEqual(expect.any(String));
    expect(clonedTemplate?.updated_at).toBe(clonedTemplate?.created_at);
  });
});
