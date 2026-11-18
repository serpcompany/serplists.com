import { describe, expect, it } from 'vitest';

import { parseWranglerResultSets } from '../../../scripts/lib/wrangler-json';

describe('parseWranglerResultSets', () => {
  it('reads the result sets wrangler d1 execute --json prints, one per statement', () => {
    const output = JSON.stringify([
      { results: [{ name: 'users', count: 3 }], success: true, meta: { rows_read: 3 } },
      { success: true, meta: {} },
    ]);

    expect(parseWranglerResultSets(output)).toEqual([{ results: [{ name: 'users', count: 3 }] }, {}]);
  });

  it('refuses output that is not a list of result sets', () => {
    expect(() => parseWranglerResultSets(JSON.stringify({ error: 'D1_ERROR' }))).toThrow();
    expect(() => parseWranglerResultSets('Unknown argument: --json')).toThrow(SyntaxError);
  });
});
