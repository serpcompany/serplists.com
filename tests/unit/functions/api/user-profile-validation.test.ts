import { describe, expect, it } from 'vitest';

import { uploadedAvatarUrlError, validateUserProfileWrite } from '@functions/api/utils/user-profile-validation';
import { errorThrownBy } from '../../../support/thrownError';

const policy = { avatarUrlPrefixes: ['https://serplists.com/api/uploads/'] };

describe('validateUserProfileWrite', () => {
  it('refuses a new user written with no name at all, while an update may leave the name out', () => {
    expect(errorThrownBy(() => validateUserProfileWrite({ email: 'new@example.com' }, 'create', policy))).toMatchObject({
      statusCode: 400,
    });
    expect(validateUserProfileWrite({ emailVerified: true }, 'update', policy)).toEqual({ emailVerified: true });
  });
});

describe('uploadedAvatarUrlError', () => {
  it('accepts an image uploaded to SERP Lists', () => {
    expect(uploadedAvatarUrlError('https://serplists.com/api/uploads/avatars/a.png', policy)).toBeNull();
  });

  it.each([
    ['text that is not a URL', 'avatar.png', 'Avatar image must be a URL.'],
    ['an image hosted elsewhere', 'https://images.example.com/a.png', 'Upload the avatar image to SERP Lists.'],
  ])('refuses %s', (_label, value, message) => {
    expect(uploadedAvatarUrlError(value, policy)).toBe(message);
  });
});
