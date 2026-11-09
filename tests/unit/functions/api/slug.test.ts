import { describe, expect, it } from 'vitest';

import { templatePayloadSchema } from '@functions/api/utils/payloads';
import { generateSlug, resolveRequestedSlug, truncateSlug, withSlugSuffix } from '@functions/api/utils/slug';
import { PUBLIC_HANDLE_MAX_LENGTH } from '@/lib/schemas/publicHandle';
import { TEMPLATE_SLUG_MAX } from '@/lib/schemas/templateLimits';
import { stringMatching } from '../../../support/asymmetricMatchers';

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
    ['Organization', PUBLIC_HANDLE_MAX_LENGTH],
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

describe('resolveRequestedSlug', () => {
  it('leaves the slug unchanged when a save sends none', () => {
    expect(resolveRequestedSlug(undefined, 'launch-checklist')).toEqual({ kind: 'unchanged' });
  });

  it('keeps a long requested slug within the template slug length', () => {
    const resolved = resolveRequestedSlug(`New ${'Launch '.repeat(40)}`, 'launch-checklist');

    expect(resolved).toMatchObject({ kind: 'changed', slug: stringMatching(SLUG_PATTERN) });
    expect('slug' in resolved && resolved.slug.length).toBeLessThanOrEqual(TEMPLATE_SLUG_MAX);
  });
});

describe('withSlugSuffix', () => {
  it('adds the suffix after a hyphen', () => {
    expect(withSlugSuffix('launch', 'abcd1234', 160)).toBe('launch-abcd1234');
  });
});
