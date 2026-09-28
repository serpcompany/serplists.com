import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { PublicProfileState } from '@/features/public-profile/usePublicProfile';
import UserProfile from '@/pages/UserProfile';

const mockUsePublicProfile = vi.fn<() => PublicProfileState>();

vi.mock('@/features/public-profile/usePublicProfile', () => ({
  usePublicProfile: () => mockUsePublicProfile(),
}));

// Pages answers every path with index.html and a 200, so an unknown username must mark the
// page noindex. A failed lookup may be transient, so it must not: it offers a retry instead.
function renderProfile(result: PublicProfileState['result']) {
  mockUsePublicProfile.mockReturnValue({ result, retry: vi.fn() });
  const context: { helmet?: { meta: { toString(): string }; title: { toString(): string }; link: { toString(): string } } } = {};
  const html = renderToStaticMarkup(
    <HelmetProvider context={context}>
      <StaticRouter location="/profile/nobody">
        <Routes>
          <Route path="/profile/:username" element={<UserProfile />} />
        </Routes>
      </StaticRouter>
    </HelmetProvider>,
  );
  return { helmet: context.helmet!, html };
}

describe('UserProfile lookup states', () => {
  it('marks an unknown username noindex, with no canonical URL', () => {
    const { helmet, html } = renderProfile({ status: 'not_found' });

    expect(html).toContain('User not found');
    expect(helmet.meta.toString()).toMatch(/name="robots" content="noindex, follow"/);
    expect(helmet.title.toString()).toContain('>User not found | SERP Lists</title>');
    expect(helmet.link.toString()).not.toContain('canonical');
  });

  it('offers a retry and stays indexable when the lookup failed', () => {
    const { helmet, html } = renderProfile({ status: 'error' });

    expect(html).toContain('Could not load this profile');
    expect(html).toContain('Try again');
    expect(html).not.toContain('User not found');
    expect(helmet.meta.toString()).not.toContain('noindex');
  });

  it('shows a loading state without noindex while the lookup runs', () => {
    const { helmet, html } = renderProfile(null);

    expect(html).toContain('Loading profile...');
    expect(helmet.meta.toString()).not.toContain('noindex');
  });

  it('leaves a found profile indexable', () => {
    const { helmet, html } = renderProfile({
      status: 'found',
      profile: {
        id: 'user-1',
        full_name: 'Alice Example',
        username: 'alice',
        avatar_url: null,
        created_at: '2026-04-18T00:00:00.000Z',
      },
      templates: [],
    });

    expect(html).toContain('Alice Example');
    expect(helmet.meta.toString()).not.toContain('noindex');
  });
});
