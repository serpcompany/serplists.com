import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { firstIssue } from '@/lib/schemas/firstIssue';

const runRequest = z.object({ title: z.string().min(1, 'Name the run'), seats: z.number().int().positive() });

describe('firstIssue', () => {
  it("reads the path and message of a failed parse's first issue, leaving the later ones", () => {
    const parsed = runRequest.safeParse({ title: '', seats: -2, extra: true });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues).toHaveLength(2);
    expect(firstIssue(parsed.error)).toEqual({ path: ['title'], message: 'Name the run' });
  });

  it('keeps array positions in the path as numbers', () => {
    const parsed = z.array(z.object({ id: z.string() })).safeParse([{ id: 'a' }, { id: 7 }]);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(firstIssue(parsed.error)).toEqual({ path: [1, 'id'], message: 'Expected string, received number' });
  });
});
