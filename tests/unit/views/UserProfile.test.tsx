import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { LoadUserProfileResult } from '@/features/profile/loadUserProfile';
import { UserProfileContent } from '@/views/UserProfile';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

// The profile's title and description come from the server
// (tests/unit/server/pageMeta/profilePage.test.ts); the page adds a noindex tag only once it
// learns in the browser that the profile does not exist.

const renderProfile = (result: LoadUserProfileResult | null) => {
  navigation.reset('/profile/alice', { params: { username: 'alice' } });
  const html = renderToStaticMarkup(<UserProfileContent result={result} onRetry={vi.fn()} />);
  return { html, robots: html.match(/<meta name="robots" content="([^"]*)"/)?.[1] };
};

describe('UserProfile search engine tags', () => {
  it('tells search engines to drop a profile that does not exist', () => {
    const { html, robots } = renderProfile({ kind: 'not_found' });

    expect(html).toContain('User not found');
    expect(robots).toBe('noindex, nofollow');
  });

  it('keeps a profile that failed to load indexable, since the failure may be temporary', () => {
    const { html, robots } = renderProfile({
      kind: 'error',
      message: 'Unable to load this public profile.',
    });

    expect(html).toContain('Unable to load profile');
    expect(html).toContain('Try again');
    expect(html).not.toContain('User not found');
    expect(robots).toBeUndefined();
  });

  it('shows a loaded profile and keeps it indexable', () => {
    const { html, robots } = renderProfile({
      kind: 'ok',
      profile: {
        avatar_url: null,
        created_at: '2026-01-02T03:04:05.000Z',
        full_name: 'Alice Example',
        id: 'user-1',
        username: 'alice',
      },
      templates: [],
    });

    expect(html).toContain('Alice Example');
    expect(robots).toBeUndefined();
  });

  it('adds no robots tag while the profile loads', () => {
    const { html, robots } = renderProfile(null);

    expect(html).toContain('Loading profile...');
    expect(robots).toBeUndefined();
  });
});
