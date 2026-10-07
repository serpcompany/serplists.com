import { describe, expect, it } from 'vitest';

import { templateUpdateResultSchema } from '@/lib/templateUpdateResult';

describe('templateUpdateResultSchema, which reads the answer to a template save', () => {
  it('reads the stored version and slug', () => {
    expect(templateUpdateResultSchema.parse({ success: true, id: 'template-1', version: 4, slug: 'launch' })).toEqual({
      version: 4,
      slug: 'launch',
    });
  });

  it('treats a missing or null slug as unknown', () => {
    expect(templateUpdateResultSchema.parse({ success: true, version: 2, slug: null })).toEqual({ version: 2, slug: undefined });
  });

  it('rejects an answer without a version instead of guessing one', () => {
    expect(templateUpdateResultSchema.safeParse({ success: true, slug: 'launch' }).success).toBe(false);
  });
});
