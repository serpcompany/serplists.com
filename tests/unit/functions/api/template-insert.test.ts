import { describe, expect, it } from 'vitest';

import { isTemplateSlugUniqueViolation, templateSlugBase } from '@functions/api/utils/template-insert';

describe('isTemplateSlugUniqueViolation', () => {
  it.each([
    ['the D1 message', new Error('D1_ERROR: UNIQUE constraint failed: templates.slug: SQLITE_CONSTRAINT')],
    ['the SQLite message', new Error('UNIQUE constraint failed: templates.slug')],
    ['a query error wrapping it', new Error('Failed query: insert into "templates" ...', { cause: new Error('UNIQUE constraint failed: templates.slug') })],
  ])('matches %s', (_label, error) => {
    expect(isTemplateSlugUniqueViolation(error)).toBe(true);
  });

  it.each([
    ['a concurrent template version', new Error('D1_ERROR: UNIQUE constraint failed: template_versions.template_id, template_versions.version: SQLITE_CONSTRAINT')],
    ['an Organization slug', new Error('UNIQUE constraint failed: teams.slug')],
    ['a foreign key', new Error('D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT')],
    ['a query that only names the column', new Error('Failed query: insert into "templates" ("slug") values (?)')],
    ['a non-error value', 'templates.slug'],
  ])('does not match %s', (_label, error) => {
    expect(isTemplateSlugUniqueViolation(error)).toBe(false);
  });
});

describe('templateSlugBase', () => {
  it('keeps the fallback for a title with nothing usable', () => {
    expect(templateSlugBase('Список')).toBe('template');
    expect(templateSlugBase('')).toBe('template');
    expect(templateSlugBase('Weekly Review')).toBe('weekly-review');
  });
});
