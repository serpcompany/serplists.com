import { describe, expect, it } from 'vitest';
import {
  checklistPayloadSchema,
  templatePayloadSchema,
  templateUpdatePayloadSchema,
} from '@functions/api/utils/payloads';
import { decodeSlugPath, resolveRequestedSlug } from '@functions/api/utils/slug';

describe('payload schemas', () => {
  it('accepts valid template payloads', () => {
    const result = templatePayloadSchema.safeParse({
      title: 'Content Refresh Checklist',
      description: 'Refresh top pages',
      slug: 'content-refresh-checklist',
      seoTitle: 'SEO title',
      seoDescription: 'SEO description',
      categories: ['seo', 'content'],
      tags: ['refresh'],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.seoTitle).toBe('SEO title');
      expect(result.data.seoDescription).toBe('SEO description');
    }
  });

  it('rejects invalid template slugs', () => {
    const result = templatePayloadSchema.safeParse({
      title: 'Content Refresh Checklist',
      slug: 'Bad Slug!',
    });

    expect(result.success).toBe(false);
  });

  it('lets updates echo a legacy slug for the handler to compare with the stored one', () => {
    const legacySlug = "tom's-list:-week-1-1a2b3c4d";

    expect(templatePayloadSchema.safeParse({ slug: legacySlug }).success).toBe(false);
    expect(templateUpdatePayloadSchema.safeParse({ title: 'List', slug: legacySlug }).success).toBe(true);
    expect(resolveRequestedSlug(legacySlug, legacySlug)).toEqual({ kind: 'unchanged' });
    expect(resolveRequestedSlug('', legacySlug)).toEqual({ kind: 'unchanged' });
    expect(resolveRequestedSlug('new-list', legacySlug)).toEqual({ kind: 'changed', slug: 'new-list' });
    expect(resolveRequestedSlug('Bad Slug!', legacySlug)).toEqual({
      kind: 'invalid',
      message: 'slug must be lowercase letters, numbers, and hyphens only',
    });
  });

  it('decodes slug path segments and rejects malformed encodings', () => {
    expect(decodeSlugPath(['qanda%3A-launch-plan-1a2b3c4d'])).toBe('qanda:-launch-plan-1a2b3c4d');
    expect(decodeSlugPath(['caf%C3%A9-list'])).toBe('café-list');
    expect(decodeSlugPath(['plain-slug'])).toBe('plain-slug');
    expect(decodeSlugPath(['%E0%A4%A'])).toBeNull();
  });

  it('rejects empty template titles when provided', () => {
    const result = templatePayloadSchema.safeParse({
      title: '   ',
    });

    expect(result.success).toBe(false);
  });

  it('accepts valid checklist payloads', () => {
    const result = checklistPayloadSchema.safeParse({
      title: 'Run title',
      status: 'in_progress',
      progress: 50,
      completed_at: null,
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid checklist status values', () => {
    const result = checklistPayloadSchema.safeParse({
      title: 'Run title',
      status: 'draft',
    });

    expect(result.success).toBe(false);
  });

  it('rejects progress values above 100', () => {
    const result = checklistPayloadSchema.safeParse({
      title: 'Run title',
      progress: 101,
    });

    expect(result.success).toBe(false);
  });
});
