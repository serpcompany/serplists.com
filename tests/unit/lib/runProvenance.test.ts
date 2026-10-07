import { describe, expect, it } from 'vitest';

import { RUN_ORIGIN_LABELS, runActorLabel, runProvenanceSummary } from '@/lib/runProvenance';

const alice = { userId: 'user-a', name: 'Alice Admin', username: 'alice' };
const bob = { userId: 'user-b', name: null, username: 'bob' };

describe("a run's provenance in words", () => {
  it('names an actor by name, then by username, and someone without either as an unnamed user', () => {
    expect(runActorLabel(alice)).toBe('Alice Admin');
    expect(runActorLabel(bob)).toBe('@bob');
    expect(runActorLabel({ userId: 'user-c', name: ' ', username: null })).toBe('Unnamed user');
    expect(runActorLabel(null)).toBeNull();
  });

  it('labels each origin as the product says it', () => {
    expect(RUN_ORIGIN_LABELS).toEqual({ web: 'Web', mcp: 'MCP', unknown: 'Unknown' });
  });

  it('says who started a web run, and which Run Key started an MCP run on whose authority', () => {
    expect(runProvenanceSummary({ origin: 'web', startedBy: alice })).toBe('Started by Alice Admin via Web');
    expect(runProvenanceSummary({ origin: 'mcp', startedBy: alice, agentKeyName: 'Codex SOP Runner', authorizedBy: alice })).toBe(
      'Started by Codex SOP Runner via MCP · authorized by Alice Admin',
    );
    expect(runProvenanceSummary({ origin: 'mcp', startedBy: bob })).toBe('Started by @bob via MCP');
  });

  it('leaves out the origin when it is unknown, and says nothing when nothing was recorded', () => {
    expect(runProvenanceSummary({ origin: 'unknown', startedBy: alice })).toBe('Started by Alice Admin');
    expect(runProvenanceSummary({ origin: 'web', startedBy: null })).toBe('Started via Web');
    expect(runProvenanceSummary({ origin: 'unknown', startedBy: null })).toBeNull();
    expect(runProvenanceSummary(undefined)).toBeNull();
  });
});
