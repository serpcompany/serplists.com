import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ProfileSection } from '@/components/account/ProfileSection';
import { USER_NAME_MAX_LENGTH } from '@/lib/schemas/userProfileSchema';

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, refreshProfile: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({ api: { uploadToR2: vi.fn() } }));
vi.mock('@/lib/auth-client', () => ({ authClient: { updateUser: vi.fn() } }));

describe('ProfileSection', () => {
  it('limits the full name to the length the API accepts', () => {
    const html = renderToStaticMarkup(
      <StaticRouter location="/dashboard/settings">
        <ProfileSection
          profileData={{ email: 'john@test.com', fullName: 'John', username: 'john', avatar_url: '' }}
          loading={false}
          onProfileDataChange={vi.fn()}
          onProfileUpdate={vi.fn()}
          onAvatarUpdate={vi.fn()}
        />
      </StaticRouter>,
    );

    expect(html).toMatch(new RegExp(`<input[^>]*id="fullName"[^>]*maxLength="${USER_NAME_MAX_LENGTH}"`));
  });
});
