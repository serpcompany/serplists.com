import { beforeEach, describe, expect, it } from 'vitest';
import { dbMocks, mockEnv, PRO_PLAN, resetToASignedInUser } from '../../../support/apiHandlerMocks';

import { buildTemplateHistoryTimeline } from '@/features/template-detail/templateHistoryTimeline';
import type { TemplateHistoryResponse } from '@/lib/api';
import { HISTORY_DISPLAY_LIMIT } from '@/lib/history';
import { handleTemplates } from '@functions/api/handlers/templates';

const at = (minute: number) => `2026-07-03T12:0${minute}:00.000Z`;
const actor = { actor_email: 'owner@example.com', actor_name: 'Owner', actor_username: 'owner' };

const versionRowsAfterCreateAndShare = [
  { id: 'version-2', version: 2, changed_by_user_id: 'user-1', content_hash: 'hash-2', change_summary: 'template.updated', created_at: at(2), ...actor },
  { id: 'version-1', version: 1, changed_by_user_id: 'user-1', content_hash: 'hash-1', change_summary: 'template.created', created_at: at(1), ...actor },
];
const auditRowsAfterCreateShareArchiveAndRestore = [
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
    mockEnv,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as TemplateHistoryResponse;
};

describe("GET /api/templates/:id/history fed straight into the Changelog builder keeps the events the Changelog needs", () => {
  beforeEach(() => {
    resetToASignedInUser('user-1', PRO_PLAN);
    dbMocks.selectChain.orderBy.mockReturnValue(dbMocks.selectChain);
  });

  it('shows Share, archive and restore next to the versions, reading both lists up to the Changelog limit', async () => {
    const history = await loadHistory(versionRowsAfterCreateAndShare, auditRowsAfterCreateShareArchiveAndRestore);

    expect(buildTemplateHistoryTimeline(history).map((entry) => entry.label)).toEqual([
      'Restored template',
      'Deleted template',
      'Made template public',
      'Created template v1',
    ]);
    expect(dbMocks.selectChain.limit).toHaveBeenNthCalledWith(2, HISTORY_DISPLAY_LIMIT);
    expect(dbMocks.selectChain.limit).toHaveBeenNthCalledWith(3, HISTORY_DISPLAY_LIMIT);
  });

  it("names the Run Key that each write's audit event records behind an Agent's create and edit, as the run's Changelog does", async () => {
    const auditMetadataNamingTheRunKey = '{"source":"mcp","personalRunKeyId":"key-1","personalRunKeyName":"Codex SOP Writer"}';
    const history = await loadHistory(
      [
        { ...versionRowsAfterCreateAndShare[0], id: 'version-2', created_at: at(3) },
        versionRowsAfterCreateAndShare[1],
      ],
      [
        { ...auditRowsAfterCreateShareArchiveAndRestore[3], id: 'audit-2', action: 'template.updated', metadata_json: auditMetadataNamingTheRunKey, created_at: at(3) },
        { ...auditRowsAfterCreateShareArchiveAndRestore[3], metadata_json: auditMetadataNamingTheRunKey },
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
