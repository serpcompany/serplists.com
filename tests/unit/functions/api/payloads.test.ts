import { describe, expect, it } from 'vitest';
import { checklistPayloadSchema, templatePayloadSchema, normalizeSectionsPayload } from '@functions/api/utils/payloads';

describe('payload schemas', () => {
  it.each([
    [{ id: 's', items: [{ id: 'i', contents: [{ id: 'c', type: 'text', value: 'A' }, { id: 'c', type: 'text', value: 'B' }] }] }],
    [{ id: 's1', items: [{ id: 'i' }] }, { id: 's2', items: [{ id: 'i' }] }],
    [{ id: 's', items: [] }, { id: 's', items: [] }],
    [{ items: [{ contents: [{ type: 'subItems', subItems: [{ id: 'sub' }, { id: 'sub' }] }] }] }],
  ])('rejects ambiguous explicit identities before persistence: %j', (...sections) => {
    expect(normalizeSectionsPayload(sections).error).toBeDefined();
  });
  it('rejects object-valued content before a template or run can be persisted', () => {
    const result = normalizeSectionsPayload([{ title: 'Task', contents: [{ type: 'image', value: { url: 'https://example.test/image' } }] }]);
    expect(result.error).toBeDefined();
  });
  it.each([null, 3, 'bad', { title: 'Task', contents: [null] },
    { title: 'Task', contents: [{ type: 'unknown', value: '' }] },
    { title: 'Task', contents: [{ type: 'subItems', subItems: [null] }] },
    { title: 'Task', contents: [{ type: 'subItems', subItems: [{ title: {} }] }] },
  ])('rejects malformed array entries without coercion: %j', (entry) => {
    expect(normalizeSectionsPayload([entry]).error).toBeDefined();
  });
  it('preserves valid legacy content and extension fields in encoded flat and sectioned arrays', () => {
    const items = [{ title: 'Legacy', completed: true, extra: { untouched: 1 }, contents: [
      { type: 'text', value: 'Original text', extension: ['keep'] },
      { type: 'subItems', subItems: [{ title: 'Child', completed: true }] },
    ] }];
    const sections = [{ id: 's', title: 'Section', extra: 'retain', items }];
    expect(normalizeSectionsPayload(JSON.stringify(sections))).toEqual({ sections });
    expect(normalizeSectionsPayload(JSON.stringify(items))).toEqual({ sections: [{ id: '1', title: 'Checklist', items }] });
  });
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
