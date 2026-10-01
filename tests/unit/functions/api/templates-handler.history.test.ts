import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { dbMocks, mockEnv, resetTemplatesHandlerMocks } from '../../../support/templatesHandler';
import { handleTemplates } from '@functions/api/handlers/templates';
import { getSessionUserId } from '@functions/api/utils/session';
import { columnNamesIn } from '../../../support/drizzleSql';
import { readJson } from '../../../support/readJson';

const historyBody = z
  .object({
    versions: z.array(z.object({ version: z.number(), metadata: z.unknown() }).passthrough()),
    events: z.array(z.record(z.unknown())),
  })
  .passthrough();

function chainTheVersionAndEventReads() {
  dbMocks.selectChain.orderBy.mockReturnValueOnce(dbMocks.selectChain).mockReturnValueOnce(dbMocks.selectChain);
}

describe('Templates Handlers', () => {
  beforeEach(() => {
    resetTemplatesHandlerMocks();
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
  });

  it('returns template history to active team members, each version with the metadata of its audit event, and the events with them', async () => {
    chainTheVersionAndEventReads();
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          id: 'template-1',
          title: 'Team Template',
          description: '',
          items: '[]',
          version: 2,
          user_id: 'creator-1',
          owner_type: 'team',
          team_id: 'team-1',
          is_public: false,
          slug: 'team-template',
          created_at: new Date().toISOString(),
          updated_at: null,
        },
      ])
      .mockResolvedValueOnce([
        { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'viewer', status: 'active' },
      ])
      .mockResolvedValueOnce([
        {
          id: 'version-2',
          version: 2,
          changed_by_user_id: 'user-123',
          subject_type: 'team',
          subject_id: 'team-1',
          content_hash: 'hash-2',
          change_summary: 'template.updated',
          created_at: '2026-07-03T12:00:00.000Z',
          actor_email: 'editor@example.com',
          actor_name: 'Editor Example',
          actor_username: 'editor',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'audit-4',
          actor_user_id: 'user-123',
          action: 'template.restored',
          metadata_json: null,
          request_id: 'req-4',
          created_at: '2026-07-03T12:02:00.000Z',
          actor_email: 'editor@example.com',
          actor_name: 'Editor Example',
          actor_username: 'editor',
        },
        {
          id: 'audit-3',
          actor_user_id: 'user-123',
          action: 'template.deleted',
          metadata_json: null,
          request_id: 'req-3',
          created_at: '2026-07-03T12:01:00.000Z',
          actor_email: 'editor@example.com',
          actor_name: 'Editor Example',
          actor_username: 'editor',
        },
        {
          id: 'audit-2',
          actor_user_id: 'user-123',
          action: 'template.updated',
          metadata_json: '{"visibility":"public"}',
          request_id: 'req-2',
          created_at: '2026-07-03T12:00:00.000Z',
          actor_email: 'editor@example.com',
          actor_name: 'Editor Example',
          actor_username: 'editor',
        },
      ]);

    const request = new Request('http://localhost/api/templates/template-1/history?limit=8', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, historyBody);

    expect(response.status).toBe(200);
    expect(data.subject).toEqual({ type: 'team', id: 'team-1' });
    expect(data.versions[0]).toEqual(
      expect.objectContaining({
        action: 'template.updated',
        version: 2,
        actor: expect.objectContaining({ name: 'Editor Example' }),
        metadata: { visibility: 'public' },
      }),
    );
    expect(data.events).toEqual([
      expect.objectContaining({ id: 'audit-4', action: 'template.restored', metadata: null }),
      expect.objectContaining({ id: 'audit-3', action: 'template.deleted', metadata: null }),
      expect.objectContaining({ id: 'audit-2', action: 'template.updated', metadata: { visibility: 'public' } }),
    ]);
    for (const event of data.events) {
      expect(event).not.toHaveProperty('diff');
    }
    expect(dbMocks.selectChain.limit).toHaveBeenCalledTimes(4);
    const [, , versionsLimit, eventsLimit] = dbMocks.selectChain.limit.mock.calls.map(([limit]) => limit);
    expect(versionsLimit).toBe(8);
    expect(eventsLimit).toBe(8);
    const eventColumns = (dbMocks.db.select.mock.calls[3] as unknown[])[0] as Record<string, unknown>;
    expect(eventColumns).toHaveProperty('metadata_json');
    expect(eventColumns).not.toHaveProperty('diff_json');
    const versionOrder = columnNamesIn(dbMocks.selectChain.orderBy.mock.calls[0][0]);
    expect(versionOrder).toContain('version');
    expect(versionOrder).not.toContain('created_at');
  });

  it('returns audit events without diffs, also for templates that have no versions', async () => {
    chainTheVersionAndEventReads();
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([{ id: 'template-1', title: 'Legacy', items: '[]', version: 1, user_id: 'user-123', owner_type: 'user', team_id: null, is_public: false }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'audit-1',
          actor_user_id: 'user-123',
          action: 'template.updated',
          diff_json: JSON.stringify({ items: 'x'.repeat(200_000) }),
          metadata_json: '{"source":"test"}',
          request_id: 'req-1',
          created_at: '2026-07-03T12:00:00.000Z',
          actor_name: 'Owner',
        },
      ]);

    const response = await handleTemplates(new Request('http://localhost/api/templates/template-1/history?limit=', { method: 'GET' }), mockEnv);
    const body = await response.text();
    const data = historyBody.parse(JSON.parse(body));

    expect(response.status).toBe(200);
    expect(data.events).toEqual([expect.objectContaining({ id: 'audit-1', metadata: { source: 'test' } })]);
    expect(data.events[0]).not.toHaveProperty('diff');
    expect(body.length).toBeLessThan(2_000);
    expect(dbMocks.selectChain.limit).toHaveBeenNthCalledWith(2, 50);
  });

  it('gives each version the metadata of the audit event its write recorded, naming a Run Key, and null to one older than the newest events read', async () => {
    const actor = { actor_email: 'owner@example.com', actor_name: 'Owner', actor_username: 'owner' };
    const agent = { source: 'mcp', personalRunKeyId: 'key-1', personalRunKeyName: 'Codex SOP Writer' };
    const version = (version: number, action: string, createdAt: string) => ({
      id: `version-${version}`,
      version,
      changed_by_user_id: 'user-123',
      content_hash: `hash-${version}`,
      change_summary: action,
      created_at: createdAt,
      ...actor,
    });
    const event = (id: string, action: string, createdAt: string, metadata: unknown) => ({
      id,
      actor_user_id: 'user-123',
      action,
      metadata_json: metadata === null ? null : JSON.stringify(metadata),
      request_id: `req-${id}`,
      created_at: createdAt,
      ...actor,
    });
    chainTheVersionAndEventReads();
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([{ id: 'template-1', title: 'Launch', items: '[]', version: 3, user_id: 'user-123', owner_type: 'user', team_id: null, is_public: false }])
      .mockResolvedValueOnce([
        version(3, 'template.updated', '2026-07-03T12:03:00.000Z'),
        version(2, 'template.updated', '2026-07-03T12:02:00.000Z'),
      ])
      .mockResolvedValueOnce([
        event('audit-4', 'template.deleted', '2026-07-03T12:04:00.000Z', null),
        event('audit-3', 'template.updated', '2026-07-03T12:03:00.000Z', agent),
      ]);

    const response = await handleTemplates(
      new Request('http://localhost/api/templates/template-1/history?limit=2', { method: 'GET' }),
      mockEnv,
    );
    const data = await readJson(response, historyBody);

    expect(response.status).toBe(200);
    expect(data.versions.map(({ version, metadata }) => [version, metadata])).toEqual([
      [3, agent],
      [2, null],
    ]);
    expect(data.events[1]).toEqual(expect.objectContaining({ id: 'audit-3', metadata: agent }));
  });

  it('should not expose public template history to non-owners', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'template-1',
        title: 'Public Template',
        description: '',
        items: '[]',
        version: 1,
        user_id: 'other-user',
        owner_type: 'user',
        team_id: null,
        is_public: true,
        slug: 'public-template',
        created_at: new Date().toISOString(),
        updated_at: null,
      },
    ]);

    const request = new Request('http://localhost/api/templates/template-1/history', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);

    expect(response.status).toBe(404);
  });
});
