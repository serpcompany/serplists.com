import { beforeEach, describe, expect, it, vi } from 'vitest';

// The Changelog is built from GET /api/templates/:id/history: this test feeds the handler's
// JSON straight into the timeline builder, so a server that stops sending the events the
// timeline needs (archive, restore, a Share's visibility metadata) fails here.
const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  const db = { select: vi.fn(() => selectChain) };
  return { selectChain, db };
});

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => dbMocks.db),
}));

vi.mock('@functions/api/utils/session', () => ({
  getSessionUserId: vi.fn(),
}));

import { buildTemplateHistoryTimeline } from '@/features/template-detail/templateHistoryTimeline';
import type { TemplateHistoryResponse } from '@/lib/api';
import { HISTORY_DISPLAY_LIMIT } from '@/lib/history';
import { handleTemplates } from '@functions/api/handlers/templates';
import { getSessionUserId } from '@functions/api/utils/session';

const at = (minute: number) => `2026-07-03T12:0${minute}:00.000Z`;
const actor = { actor_email: 'owner@example.com', actor_name: 'Owner', actor_username: 'owner' };

// What D1 holds after: create (v1), Share (v2), archive, restore. Every versioned write
// records an audit event with the same action and time; archive and restore record only
// an event.
const versionRows = [
  { id: 'version-2', version: 2, changed_by_user_id: 'user-1', content_hash: 'hash-2', change_summary: 'template.updated', created_at: at(2), ...actor },
  { id: 'version-1', version: 1, changed_by_user_id: 'user-1', content_hash: 'hash-1', change_summary: 'template.created', created_at: at(1), ...actor },
];
const eventRows = [
  { id: 'audit-4', actor_user_id: 'user-1', action: 'template.restored', metadata_json: null, request_id: 'req-4', created_at: at(4), ...actor },
  { id: 'audit-3', actor_user_id: 'user-1', action: 'template.deleted', metadata_json: null, request_id: 'req-3', created_at: at(3), ...actor },
  { id: 'audit-2', actor_user_id: 'user-1', action: 'template.updated', metadata_json: '{"visibility":"public"}', request_id: 'req-2', created_at: at(2), ...actor },
  { id: 'audit-1', actor_user_id: 'user-1', action: 'template.created', metadata_json: null, request_id: 'req-1', created_at: at(1), ...actor },
];

const loadHistory = async (versions: unknown[], events: unknown[]): Promise<TemplateHistoryResponse> => {
  dbMocks.selectChain.limit
    .mockResolvedValueOnce([
      { id: 'template-1', title: 'Launch', items: '[]', version: 2, user_id: 'user-1', owner_type: 'user', team_id: null, is_public: false },
    ])
    .mockResolvedValueOnce(versions)
    .mockResolvedValueOnce(events)
    .mockResolvedValue([]);
  const response = await handleTemplates(
    new Request(`http://localhost/api/templates/template-1/history?limit=${HISTORY_DISPLAY_LIMIT}`, { method: 'GET' }),
    { DB: {}, BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' } as never,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as TemplateHistoryResponse;
};

describe('template history API to Changelog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.limit.mockReset();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.leftJoin.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.orderBy.mockReturnValue(dbMocks.selectChain);
    vi.mocked(getSessionUserId).mockResolvedValue('user-1');
  });

  it('shows Share, archive and restore next to the versions', async () => {
    const history = await loadHistory(versionRows, eventRows);

    expect(buildTemplateHistoryTimeline(history).map((entry) => entry.label)).toEqual([
      'Restored template',
      'Deleted template',
      'Made template public',
      'Created template v1',
    ]);
    // Both lists are bounded by the Changelog's limit.
    expect(dbMocks.selectChain.limit).toHaveBeenNthCalledWith(2, HISTORY_DISPLAY_LIMIT);
    expect(dbMocks.selectChain.limit).toHaveBeenNthCalledWith(3, HISTORY_DISPLAY_LIMIT);
  });

  // What D1 holds after a Run Key created the template (v1) and edited it (v2): the versions
  // name the user who authorized the key, and each write's audit event names the key.
  it("names the Run Key behind an Agent's create and edit, as the run's Changelog does", async () => {
    const agent = '{"source":"mcp","personalRunKeyId":"key-1","personalRunKeyName":"Codex SOP Writer"}';
    const history = await loadHistory(
      [
        { ...versionRows[0], id: 'version-2', created_at: at(3) },
        versionRows[1],
      ],
      [
        { ...eventRows[3], id: 'audit-2', action: 'template.updated', metadata_json: agent, created_at: at(3) },
        { ...eventRows[3], metadata_json: agent },
      ],
    );

    expect(history.versions.map(({ metadata }) => metadata)).toEqual([
      { source: 'mcp', personalRunKeyId: 'key-1', personalRunKeyName: 'Codex SOP Writer' },
      { source: 'mcp', personalRunKeyId: 'key-1', personalRunKeyName: 'Codex SOP Writer' },
    ]);
    expect(buildTemplateHistoryTimeline(history).map(({ label, actorName }) => [label, actorName])).toEqual([
      ['Updated template v2', 'Codex SOP Writer via MCP · authorized by Owner'],
      ['Created template v1', 'Codex SOP Writer via MCP · authorized by Owner'],
    ]);
  });
});
