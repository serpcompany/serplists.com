import { navigation } from '../../support/mockedNextNavigation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { LoadPublicProfileResult } from '@/features/profile/loadPublicProfile';
import type { ChecklistTemplate } from '@/types/checklist';
import { PublicProfileContent } from '@/views/PublicProfile';

const renderProfile = (result: LoadPublicProfileResult | null) => {
  navigation.reset('/profile/alice', { params: { username: 'alice' } });
  const html = renderToStaticMarkup(<PublicProfileContent result={result} onRetry={vi.fn()} />);
  return { html, robots: html.match(/<meta name="robots" content="([^"]*)"/)?.[1] };
};

const organizationTemplate: ChecklistTemplate = {
  id: 'template-1',
  title: 'Launch Plan',
  description: 'Steps to launch',
  sections: [{ id: 's1', title: 'Launch', items: [{ id: 'i1', title: 'Check DNS' }] }],
  userId: 'creator-1',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
  isPublic: true,
  slug: 'launch-plan',
  categories: ['Operations'],
  ownerType: 'team',
  ownerProfile: { username: 'alice', full_name: 'Alice Creator' },
  owner: { type: 'team', publicHandle: 'Acme-Launch', displayName: 'Acme Launch' },
};

const acme = (overrides: Partial<Extract<LoadPublicProfileResult, { kind: 'organization' }>['organization']> = {}) =>
  renderProfile({
    kind: 'organization',
    organization: {
      avatar_url: null,
      description: 'Launch checklists for agencies.',
      handle: 'Acme-Launch',
      name: 'Acme Launch',
      ...overrides,
    },
    templates: [organizationTemplate],
  });

describe('PublicProfile search engine tags', () => {
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
      kind: 'user',
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
    expect(html).toContain('Joined January 2026');
    expect(robots).toBeUndefined();
  });

  it('adds no robots tag while the profile loads', () => {
    const { html, robots } = renderProfile(null);

    expect(html).toContain('Loading profile...');
    expect(robots).toBeUndefined();
  });
});

describe('an Organization Public Profile', () => {
  it('shows the Organization by name and handle, with its description and its public Templates at its own URL', () => {
    const { html, robots } = acme();

    expect(html).toMatch(/<h1[^>]*>Acme Launch<\/h1>/);
    expect(html).toContain('@Acme-Launch');
    expect(html).toContain('Launch checklists for agencies.');
    expect(html).toContain('href="/profile/Acme-Launch/launch-plan/"');
    expect(html).not.toContain('/profile/alice/');
    expect(html).not.toContain('Joined');
    expect(robots).toBeUndefined();
  });

  it('summarizes its public Templates when the Organization has no description', () => {
    const { html } = acme({ description: null });

    expect(html).toContain('Public checklist templates from @Acme-Launch covering Operations.');
  });

  it("shows the Organization's initials until its avatar loads", () => {
    expect(acme().html).toMatch(/>AL<\/span>/);
  });
});
