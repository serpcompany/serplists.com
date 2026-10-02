import { describe, expect, it } from 'vitest';

import { templatePayloadSchema } from '@functions/api/utils/payloads';
import { generateSlug, resolveRequestedSlug, truncateSlug, withSlugSuffix } from '@functions/api/utils/slug';
import { TEMPLATE_SLUG_MAX } from '@/lib/schemas/templateLimits';
import { slugifyTemplateSlug, TEMPLATE_FIELD_LIMITS } from '@/lib/schemas/templateFields';

describe('template slug helpers', () => {
  it('always produces a slug the API accepts, or nothing', () => {
    const samples = [
      'My Launch Checklist',
      'launch_checklist',
      '--a--b--',
      "Don't Forget",
      'Ünïcödé Tïtle',
      '日本語',
      'x'.repeat(400),
      'a-'.repeat(200),
      '  ',
    ];

    for (const sample of samples) {
      const slug = slugifyTemplateSlug(sample);
      if (slug) {
        expect(templatePayloadSchema.safeParse({ slug }).success, sample).toBe(true);
      }
    }
    expect(slugifyTemplateSlug("Don't Forget")).toBe('dont-forget');
    expect(slugifyTemplateSlug('日本語')).toBe('');
  });

  it('shortens the base so a suffixed slug stays within the limit', () => {
    const slug = withSlugSuffix(`${'a'.repeat(150)}-${'b'.repeat(20)}`, '1a2b3c4d', TEMPLATE_SLUG_MAX);

    expect(slug.length).toBeLessThanOrEqual(TEMPLATE_FIELD_LIMITS.slug);
    expect(slug.endsWith('-1a2b3c4d')).toBe(true);
    expect(templatePayloadSchema.safeParse({ slug }).success).toBe(true);
  });

  it('leaves short slugs whole when adding a suffix', () => {
    expect(withSlugSuffix('launch-checklist', '1a2b3c4d', TEMPLATE_SLUG_MAX)).toBe(
      'launch-checklist-1a2b3c4d',
    );
  });
});

describe('the URL Slug field follows the shared slug rule, since the API stores the slug the editor normalized', () => {
  const samples = [
    'Straße Checkliste',
    'Ørsted',
    'Łódź guide',
    'København',
    'Kadıköy',
    'Encyclopædia',
    'Q&A Guide',
    'my_template',
    'Café',
    'Don’t Forget',
    'x'.repeat(400),
    'a-'.repeat(200),
    'Список',
  ];

  it.each(samples)('normalizes %j as the API does', (sample) => {
    expect(slugifyTemplateSlug(sample)).toBe(truncateSlug(generateSlug(sample), TEMPLATE_SLUG_MAX));
  });

  it.each(samples)('stores the same slug for %j whether or not the editor normalized it first', (sample) => {
    const slug = slugifyTemplateSlug(sample);

    expect(resolveRequestedSlug(slug || undefined, undefined)).toEqual(
      slug ? resolveRequestedSlug(sample, undefined) : { kind: 'unchanged' },
    );
  });

  it('folds letters instead of dropping them', () => {
    expect(slugifyTemplateSlug('Straße Checkliste')).toBe('strasse-checkliste');
    expect(slugifyTemplateSlug('Łódź guide')).toBe('lodz-guide');
    expect(slugifyTemplateSlug('Ørsted')).toBe('orsted');
  });
});

