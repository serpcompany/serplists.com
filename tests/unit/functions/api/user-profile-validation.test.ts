import { describe, expect, it } from 'vitest';

import { validateUserProfileWrite } from '@functions/api/utils/user-profile-validation';
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
