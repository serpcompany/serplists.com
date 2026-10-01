import { describe, expect, it } from 'vitest';

import { checklistPayloadSchema } from '@functions/api/utils/payloads';
import {
  getOrganizationNameError,
  getRunTitleError,
  ORGANIZATION_NAME_MAX,
  RUN_TITLE_MAX,
} from '@/lib/schemas/nameLimits';

// The app checks names against the limits the API enforces, so a long name gets a clear
// message instead of the API's raw schema error.
describe('run title limit', () => {
  it('matches the limit the API enforces on run titles, after trimming', () => {
    expect(checklistPayloadSchema.safeParse({ title: 'a'.repeat(RUN_TITLE_MAX) }).success).toBe(true);
    expect(checklistPayloadSchema.safeParse({ title: ` ${'a'.repeat(RUN_TITLE_MAX)} ` }).success).toBe(true);
    expect(checklistPayloadSchema.safeParse({ title: 'a'.repeat(RUN_TITLE_MAX + 1) }).success).toBe(false);
  });

  it('explains an empty or too long title, measured after trimming', () => {
    expect(getRunTitleError('   ')).toBe('Run title cannot be empty.');
    expect(getRunTitleError('a'.repeat(RUN_TITLE_MAX + 1))).toBe('Run title must be 160 characters or fewer.');
    expect(getRunTitleError(`  ${'a'.repeat(RUN_TITLE_MAX)}  `)).toBeNull();
    expect(getRunTitleError('Launch')).toBeNull();
  });

  it('counts UTF-16 code units, as the API schema and an input maxLength do, so an emoji counts twice', () => {
    const longestEmojiTitle = '\u{1F680}'.repeat(RUN_TITLE_MAX / 2);
    const oneUnitTooLong = `${longestEmojiTitle}a`;

    expect(checklistPayloadSchema.safeParse({ title: longestEmojiTitle }).success).toBe(true);
    expect(getRunTitleError(longestEmojiTitle)).toBeNull();
    expect(checklistPayloadSchema.safeParse({ title: oneUnitTooLong }).success).toBe(false);
    expect(getRunTitleError(oneUnitTooLong)).toBe('Run title must be 160 characters or fewer.');
  });
});

describe('Organization name limit', () => {
  it('explains an empty or too long name, measured after trimming', () => {
    expect(ORGANIZATION_NAME_MAX).toBe(120);
    expect(getOrganizationNameError('')).toBe('Organization name is required');
    expect(getOrganizationNameError('  ')).toBe('Organization name is required');
    expect(getOrganizationNameError('a'.repeat(ORGANIZATION_NAME_MAX + 1))).toBe(
      'Organization name must be 120 characters or fewer.',
    );
    expect(getOrganizationNameError(` ${'a'.repeat(ORGANIZATION_NAME_MAX)} `)).toBeNull();
  });
});
