import { assert, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { firstIssueOf } from '@functions/api/utils/zod-issues';

describe('firstIssueOf', () => {
  it('is the first problem a failed parse found, with its path and message', () => {
    const { error } = z.object({ name: z.string(), age: z.number() }).safeParse({ name: 1, age: 'old' });
    assert.exists(error);

    expect(firstIssueOf(error, 'Invalid person')).toMatchObject({ path: ['name'], message: 'Expected string, received number' });
  });

  it('is a problem with the whole value, carrying the fallback message, for an error that lists none', () => {
    expect(firstIssueOf(new z.ZodError([]), 'Invalid person')).toEqual({ code: 'custom', path: [], message: 'Invalid person' });
  });
});
