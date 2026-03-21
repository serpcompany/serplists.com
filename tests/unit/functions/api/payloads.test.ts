import { describe, expect, it } from 'vitest';
import { checklistPayloadSchema, templatePayloadSchema } from '@functions/api/utils/payloads';

describe('payload schemas', () => {
  it('accepts valid template payloads', () => {
    const result = templatePayloadSchema.safeParse({
      title: 'Content Refresh Checklist',
      description: 'Refresh top pages',
      slug: 'content-refresh-checklist',
      categories: ['seo', 'content'],
      tags: ['refresh'],
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid template slugs', () => {
    const result = templatePayloadSchema.safeParse({
      title: 'Content Refresh Checklist',
      slug: 'Bad Slug!',
    });

    expect(result.success).toBe(false);
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
