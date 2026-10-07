import { describe, expect, it } from 'vitest';

import { apiRunSchema } from '@/lib/schemas/apiRuns';

const run = { id: 'run-1', title: 'Run' };
const startedBy = { userId: 'user-a', name: 'Alice', username: 'alice' };

describe('a run response with provenance', () => {
  it('reads a listed run, which names its origin and starter only', () => {
    expect(apiRunSchema.parse({ ...run, provenance: { origin: 'mcp', startedBy } }).provenance).toEqual({
      origin: 'mcp',
      startedBy,
    });
  });

  it('reads an origin it does not know as unknown, and drops unreadable provenance without dropping the run', () => {
    expect(apiRunSchema.parse({ ...run, provenance: { origin: 'public_share', startedBy: null } }).provenance?.origin).toBe('unknown');

    const unreadable = apiRunSchema.parse({ ...run, provenance: { origin: 'web', startedBy: 'Alice' } });
    expect(unreadable.id).toBe('run-1');
    expect(unreadable.provenance).toBeNull();
  });

  it('reads a run without provenance, as older responses and shared runs send', () => {
    expect(apiRunSchema.parse(run).provenance).toBeUndefined();
  });
});
