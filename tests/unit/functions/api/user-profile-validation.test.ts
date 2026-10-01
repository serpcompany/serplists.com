import { describe, expect, it } from 'vitest';

import { validateUserProfileWrite } from '@functions/api/utils/user-profile-validation';

const policy = { avatarUrlPrefixes: ['https://serplists.com/api/uploads/'] };

describe('validateUserProfileWrite', () => {
  it('refuses a new user written with no name at all, while an update may leave the name out', () => {
    expect(() => validateUserProfileWrite({ email: 'new@example.com' }, 'create', policy)).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
    expect(validateUserProfileWrite({ emailVerified: true }, 'update', policy)).toEqual({ emailVerified: true });
  });
});
