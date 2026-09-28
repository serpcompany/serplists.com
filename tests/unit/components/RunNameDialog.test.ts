import { describe, expect, it } from 'vitest';

import { buildDefaultRunName } from '@/lib/runs/runName';

describe('buildDefaultRunName', () => {
  it('fits the template title and start time within the 160-character run limit', () => {
    const startedAt = new Date('2026-09-28T12:34:56.000Z');
    const name = buildDefaultRunName('t'.repeat(160), startedAt);

    expect(name.length).toBeLessThanOrEqual(160);
    expect(name.endsWith(` - ${startedAt.toLocaleString()}`)).toBe(true);
  });

  it('keeps short titles whole', () => {
    const startedAt = new Date('2026-09-28T12:34:56.000Z');
    expect(buildDefaultRunName('Launch plan', startedAt)).toBe(`Launch plan - ${startedAt.toLocaleString()}`);
  });
});
