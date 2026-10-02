import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ProfileSection } from '@/components/account/ProfileSection';
import { USER_NAME_MAX_LENGTH } from '@/lib/schemas/userProfileSchema';
import { findElement } from '../../support/elementTree';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, refreshProfile: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({ api: { uploadToR2: vi.fn() } }));
vi.mock('@/lib/auth-client', () => ({ authClient: { updateUser: vi.fn() } }));

describe('ProfileSection', () => {
  it('limits the full name to the length the API accepts', () => {
    navigation.reset('/dashboard/settings/');
    const html = renderToStaticMarkup(
      <ProfileSection
        profileData={{ email: 'john@test.com', fullName: 'John', username: 'john', avatar_url: '' }}
        loading={false}
        onProfileDataChange={vi.fn()}
        onProfileUpdate={vi.fn()}
        onAvatarUpdate={vi.fn()}
      />,
    );

    expect(html).toMatch(new RegExp(`<input[^>]*id="fullName"[^>]*maxLength="${USER_NAME_MAX_LENGTH}"`));
  });

  const renderSection = (username: string, savedUsername: string | undefined) => {
    navigation.reset('/dashboard/settings/');
    return renderToStaticMarkup(
      <ProfileSection
        profileData={{ email: 'john@test.com', fullName: 'John', username, avatar_url: '' }}
        savedUsername={savedUsername}
        loading={false}
        onProfileDataChange={vi.fn()}
        onProfileUpdate={vi.fn()}
        onAvatarUpdate={vi.fn()}
      />,
    );
  };

  it('previews the lowercase profile URL an edited username will have', () => {
    for (const savedUsername of ['john', undefined]) {
      const html = renderSection('JohnDoe', savedUsername);

      expect(html).toContain('href="/profile/johndoe/"');
      expect(html).not.toContain('/profile/JohnDoe');
    }
  });

  it("links a saved legacy mixed-case username as stored, the only casing the profile lookup finds, since its lowercase form may be another user's", () => {
    const html = renderSection('JaneDoe', 'JaneDoe');

    expect(html).toContain('href="/profile/JaneDoe/"');
    expect(html).not.toContain('/profile/janedoe');
  });

  it('previews the lowercase URL a case-only edit of a legacy username will store', () => {
    const html = renderSection('JANEDOE', 'JaneDoe');

    expect(html).toContain('href="/profile/janedoe/"');
    expect(html).not.toContain('/profile/JaneDoe');
  });

  it('keeps the placeholder while the username is empty', () => {
    const html = renderSection('', 'JaneDoe');

    expect(html).not.toContain('href="/profile/');
    expect(html).toContain('/profile/username/');
  });

  it.each([
    ['fullName', 'Johnny', { fullName: 'Johnny' }],
    ['username', 'johnny!', { username: 'johnny' }],
  ])('applies a keystroke in %s to the latest profile, so typing never undoes an avatar change made since the render', (id, typed, change) => {
    const renderedProfile = { email: 'john@test.com', fullName: 'John', username: 'john', avatar_url: '' };
    const onProfileDataChange = vi.fn();
    const section = ProfileSection({
      profileData: renderedProfile,
      savedUsername: 'john',
      loading: false,
      onProfileDataChange,
      onProfileUpdate: vi.fn(),
      onAvatarUpdate: vi.fn(),
    });
    const field = findElement(section, (element) => element.props.id === id);

    (field?.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: typed } });

    const update = onProfileDataChange.mock.calls[0][0] as (current: typeof renderedProfile) => typeof renderedProfile;
    const withNewAvatar = { ...renderedProfile, avatar_url: 'https://cdn.example.com/new-avatar.png' };
    expect(update(withNewAvatar)).toEqual({ ...withNewAvatar, ...change });
  });
});
