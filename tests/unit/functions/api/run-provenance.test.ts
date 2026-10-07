import { describe, expect, it } from 'vitest';

import { creationOf } from '@functions/api/utils/run-provenance';

const alice = { userId: 'user-a', name: 'Alice', username: 'alice' };
const firstEvent = (action: string, metadata: unknown, actor: unknown = alice) =>
  JSON.stringify({ action, metadata: metadata === null ? null : JSON.stringify(metadata), actor });

describe("a run's origin, from its first audit event", () => {
  it('is the web app when its creation says source "web"', () => {
    expect(creationOf(firstEvent('checklist_run.created', { source: 'web' }))).toEqual({
      origin: 'web',
      agentKeyName: null,
      authorizedBy: null,
    });
  });

  it('is MCP, with the Run Key name and the person who authorized it, when its creation says source "mcp"', () => {
    expect(creationOf(firstEvent('checklist_run.created', { source: 'mcp', personalRunKeyId: 'k1', personalRunKeyName: 'Codex' }))).toEqual({
      origin: 'mcp',
      agentKeyName: 'Codex',
      authorizedBy: alice,
    });
    expect(creationOf(firstEvent('checklist_run.created', { source: 'mcp' }, JSON.stringify(alice)))).toMatchObject({
      agentKeyName: null,
      authorizedBy: alice,
    });
  });

  it('is unknown, never a guess, for an older creation with no source, a first event that is not a creation, no history, or unreadable metadata', () => {
    const unknown = { origin: 'unknown', agentKeyName: null, authorizedBy: null };

    expect(creationOf(firstEvent('checklist_run.created', null))).toEqual(unknown);
    expect(creationOf(firstEvent('checklist_run.created', { source: 'backup_import' }))).toEqual(unknown);
    expect(creationOf(firstEvent('checklist_run.updated', { source: 'mcp' }))).toEqual(unknown);
    expect(creationOf(null)).toEqual(unknown);
    expect(creationOf(JSON.stringify({ action: 'checklist_run.created', metadata: '{not json' }))).toEqual(unknown);
    expect(creationOf('not json at all')).toEqual(unknown);
  });
});
