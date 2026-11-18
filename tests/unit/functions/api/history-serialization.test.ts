import { describe, expect, it } from 'vitest';
import { serializeHistoryEvent, serializeTemplateVersionHistory } from '@functions/api/utils/history-queries';

const actor = { actor_email: 'owner@example.test', actor_name: 'Owner', actor_username: 'owner' };
const event = (metadata: string | null, action = 'template.updated') => ({
  id: 'audit-1', actor_user_id: 'user-1', action, metadata_json: metadata, request_id: 'req-1', created_at: '2026-01-01T00:00:00.000Z', ...actor,
});

describe('serializeHistoryEvent', () => {
  it.each([
    ['metadata that is not JSON', '{"source":'],
    ['no metadata', null],
  ])('shows %s as none', (_label, metadata) => {
    expect(serializeHistoryEvent(event(metadata)).metadata).toBeNull();
  });
});

describe('serializeTemplateVersionHistory', () => {
  it('names a version stored before versions recorded their action as template.versioned, with that write’s metadata', () => {
    const versions = serializeTemplateVersionHistory(
      [{ id: 'v1', version: 1, changed_by_user_id: 'user-1', content_hash: 'hash', change_summary: null, created_at: '2026-01-01T00:00:00.000Z', ...actor }],
      [serializeHistoryEvent(event('{"source":"import"}', 'template.versioned'))],
    );

    expect(versions).toEqual([expect.objectContaining({ action: 'template.versioned', metadata: { source: 'import' } })]);
  });
});
