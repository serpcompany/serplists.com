import { assert, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { firstIssueOf } from '@functions/api/utils/zod-issues';

describe('firstIssueOf', () => {
  it('is the first problem a failed parse found, with its path and message', () => {
    const { error } = z.object({ name: z.string(), age: z.number() }).safeParse({ name: 1, age: 'old' });
    assert.exists(error);

    expect(firstIssueOf(error)).toMatchObject({ path: ['name'], message: 'Expected string, received number' });
  });
});
