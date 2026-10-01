import { describe, expect, it } from 'vitest';

import { templatePayloadSchema } from '@functions/api/utils/payloads';
import { generateSlug, truncateSlug, withSlugSuffix } from '@functions/api/utils/slug';
import { TEAM_SLUG_MAX, TEMPLATE_SLUG_MAX } from '@/lib/schemas/templateLimits';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const words = ['Launch', 'SEO!', 'checklist:', '2026', '(draft)', 'a-b', '--', 'x'];

const titlesOfEveryLengthUpTo300 = Array.from({ length: 300 }, (_, length) =>
  Array.from({ length }, (_, index) => `${words[(index * 7 + length) % words.length]}${index % 3 ? ' ' : '-'}`)
    .join('')
    .slice(0, length),
);

describe('bounded slugs', () => {
  it.each([
    ['template', TEMPLATE_SLUG_MAX],
    ['Organization', TEAM_SLUG_MAX],
  ])('keeps %s slugs within %i characters and the slug pattern wherever truncation lands: a hyphen, a removed character or a word boundary', (_label, max) => {
    for (const title of titlesOfEveryLengthUpTo300) {
      const base = truncateSlug(generateSlug(title), max) || 'template';
      for (const candidate of [base, withSlugSuffix(base, 'abcd1234', max), withSlugSuffix(base, '0f9e8d7c', max)]) {
        expect(candidate.length).toBeLessThanOrEqual(max);
        expect(candidate).toMatch(SLUG_PATTERN);
      }
    }
  });

  it('produces template slugs that a later save accepts', () => {
    const base = truncateSlug(generateSlug('Checklist '.repeat(40)), TEMPLATE_SLUG_MAX);
    const suffixed = withSlugSuffix(base, 'abcd1234', TEMPLATE_SLUG_MAX);

    expect(templatePayloadSchema.shape.slug.safeParse(base).success).toBe(true);
    expect(templatePayloadSchema.shape.slug.safeParse(suffixed).success).toBe(true);
  });
});
