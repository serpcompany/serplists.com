import { describe, expect, it } from 'vitest';

import { templatePayloadSchema } from '@functions/api/utils/payloads';
import {
  appendTemplateSlugSuffix,
  slugifyTemplateSlug,
  TEMPLATE_FIELD_LIMITS,
} from '@/lib/schemas/templateFields';

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
    const slug = appendTemplateSlugSuffix(`${'a'.repeat(150)}-${'b'.repeat(20)}`, '1a2b3c4d');

    expect(slug.length).toBeLessThanOrEqual(TEMPLATE_FIELD_LIMITS.slug);
    expect(slug.endsWith('-1a2b3c4d')).toBe(true);
    expect(templatePayloadSchema.safeParse({ slug }).success).toBe(true);
  });

  it('leaves short slugs whole when adding a suffix', () => {
    expect(appendTemplateSlugSuffix('launch-checklist', '1a2b3c4d')).toBe(
      'launch-checklist-1a2b3c4d',
    );
  });
});
