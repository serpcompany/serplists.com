import { describe, expect, it } from 'vitest';

import { isUniqueViolationOn } from '@functions/api/utils/unique-violation';

describe('isUniqueViolationOn', () => {
  it.each([
    ['the SQLite message', 'UNIQUE constraint failed: template_versions.version'],
    ['the D1 message', 'D1_ERROR: UNIQUE constraint failed: template_versions.version: SQLITE_CONSTRAINT'],
    ['a composite index that includes the column', 'UNIQUE constraint failed: template_versions.template_id, template_versions.version'],
  ])('matches %s', (_label, message) => {
    expect(isUniqueViolationOn(new Error(message), 'template_versions.version')).toBe(true);
  });

  it('follows the causes a query error wraps the D1 error in', () => {
    const d1Error = new Error('D1_ERROR: UNIQUE constraint failed: teams.slug: SQLITE_CONSTRAINT');
    const queryError = new Error('Failed query: update "teams" set "slug" = ?', { cause: d1Error });

    expect(isUniqueViolationOn(new Error('Request failed', { cause: queryError }), 'teams.slug')).toBe(true);
  });

  it.each([
    ['another column', new Error('UNIQUE constraint failed: users.email')],
    ['a column whose name only starts with it', new Error('UNIQUE constraint failed: teams.slug_history')],
    ['a column named after the constraint message ends', new Error('D1_ERROR: UNIQUE constraint failed: teams.id: teams.slug')],
    ['another kind of constraint', new Error('FOREIGN KEY constraint failed: teams.slug')],
    ['a value that is not an error', 'UNIQUE constraint failed: teams.slug'],
  ])('does not match %s', (_label, error) => {
    expect(isUniqueViolationOn(error, 'teams.slug')).toBe(false);
  });
});
