import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { StaticRouter } from 'react-router-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LoadUserProfileResult } from '@/features/profile/loadUserProfile';
import { UserProfileContent } from '@/views/UserProfile';

type HelmetOutput = {
  meta: { toString(): string };
  title: { toString(): string };
};

const renderProfile = (result: LoadUserProfileResult | null) => {
  const helmetContext: { helmet?: HelmetOutput } = {};
  const html = renderToStaticMarkup(
    <HelmetProvider context={helmetContext}>
      <StaticRouter location="/profile/alice">
        <UserProfileContent result={result} onRetry={vi.fn()} />
      </StaticRouter>
    </HelmetProvider>,
  );

  return {
    html,
    meta: helmetContext.helmet?.meta.toString() ?? '',
    title: helmetContext.helmet?.title.toString() ?? '',
  };
};

describe('UserProfile search engine tags', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          href: 'https://serplists.com/profile/alice',
          origin: 'https://serplists.com',
        },
      },
    });
  });

  it('tells search engines to drop a profile that does not exist', () => {
    const { html, meta, title } = renderProfile({ kind: 'not_found' });

    expect(html).toContain('User not found');
    expect(meta).toContain('name="robots" content="noindex, nofollow"');
    expect(title).toContain('Profile not found');
  });

  it('keeps a profile that failed to load indexable, since the failure may be temporary', () => {
    const { html, meta, title } = renderProfile({
      kind: 'error',
      message: 'Unable to load this public profile.',
    });

    expect(html).toContain('Unable to load profile');
    expect(html).toContain('Try again');
    expect(html).not.toContain('User not found');
    expect(meta).not.toContain('noindex');
    expect(title).toContain('Unable to load profile');
    expect(title).not.toContain('not found');
  });

  it('names a loaded profile and keeps it indexable', () => {
    const { meta, title } = renderProfile({
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

    expect(meta).toContain('name="robots" content="index, follow"');
    expect(meta).not.toContain('noindex');
    expect(title).toContain('Alice Example');
  });

  it('adds no robots tag while the profile loads', () => {
    const { html, meta } = renderProfile(null);

    expect(html).toContain('Loading profile...');
    expect(meta).not.toContain('robots');
  });
});
