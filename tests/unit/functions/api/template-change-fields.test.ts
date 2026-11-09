import { describe, expect, it } from 'vitest';
import { validateChangedTemplateFields, visibilityChangeMetadata } from '@functions/api/utils/template-changes';

describe('validateChangedTemplateFields', () => {
  it('checks only the fields behind the columns that change, so an unchanged legacy value does not block a save', () => {
    const body = { title: 'Launch', seoTitle: 'x'.repeat(10_000) };

    expect(validateChangedTemplateFields({ title: 'Launch' }, body)).toBeNull();
    expect(validateChangedTemplateFields({ seo_title: body.seoTitle }, body)).toMatchObject({ details: { field: 'seoTitle' } });
  });

  it('has nothing to check for a column no request field sets', () => {
    expect(validateChangedTemplateFields({ is_public: true, updated_at: 'now' }, { isPublic: true })).toBeNull();
  });
});

describe('visibilityChangeMetadata', () => {
  it.each([
    [true, 'public'],
    [false, 'private'],
  ] as const)('records a save that only sets is_public to %s as a change to %s', (isPublic, visibility) => {
    expect(visibilityChangeMetadata({ is_public: isPublic })).toEqual({ visibility });
  });

  it('records nothing for a save that changes more, or something else', () => {
    expect(visibilityChangeMetadata({ is_public: true, title: 'Launch' })).toBeUndefined();
    expect(visibilityChangeMetadata({ title: 'Launch' })).toBeUndefined();
  });
});
