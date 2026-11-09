import { navigation } from '../../../support/mockedNextNavigation';
import React from 'react';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { PublicProfileDetails } from '@/components/profile/PublicProfileDetails';
import type { FoundPublicProfile, ProfileSurfaceRecord } from '@/features/profile/loadPublicProfile';
import type { ChecklistTemplate } from '@/types/checklist';

import { PRIVATE_LAUNCH_TEMPLATE } from '../../../fixtures/dashboardTemplate';
import { renderSettled } from '../../../support/renderInTheDom';

const alice: ProfileSurfaceRecord = {
  id: 'user-1',
  username: 'alice',
  full_name: 'Alice Creator',
  avatar_url: null,
  created_at: '2026-01-15T00:00:00.000Z',
};

const launch: ChecklistTemplate = {
  ...PRIVATE_LAUNCH_TEMPLATE,
  isPublic: true,
  slug: 'website-launch',
  categories: ['Launch', 'Marketing'],
  ownerProfile: { full_name: 'Alice Creator', username: 'alice' },
  sections: [{ id: 's1', title: 'Prep', items: [{ id: 't1', title: 'Write copy' }] }],
};

const showTheProfile = (found: FoundPublicProfile) => renderSettled(<PublicProfileDetails found={found} />);

const stats = () =>
  screen.getAllByText(/^(Templates|Total Views|Checklist Items|Total Runs|Categories)$/).map((label) => label.parentElement?.textContent);

beforeEach(() => {
  navigation.reset('/profile/alice/');
});

describe("a User's public profile", () => {
  it('shows where they are, their website, when they joined, and their audience', async () => {
    await showTheProfile({
      kind: 'user',
      profile: { ...alice, location: 'Lisbon', website: 'alice.example.test', totalViews: 12_345, totalRuns: 678 },
      templates: [launch],
    });

    expect(screen.getByText('Lisbon')).toBeTruthy();
    const website = screen.getByRole('link', { name: 'alice.example.test' });
    expect(website.getAttribute('href')).toBe('https://alice.example.test');
    expect(website.getAttribute('target')).toBe('_blank');
    expect(screen.getByText('Joined January 2026')).toBeTruthy();
    expect(stats()).toEqual(['1Templates', '12,345Total Views', '678Total Runs']);
  });

  it('links a website that has its scheme as it is, and shows it without the scheme or a trailing slash', async () => {
    await showTheProfile({ kind: 'user', profile: { ...alice, created_at: null, website: 'http://alice.example.test/' }, templates: [] });

    expect(screen.getByRole('link', { name: 'alice.example.test' }).getAttribute('href')).toBe('http://alice.example.test/');
    expect(screen.queryByText(/^Joined/)).toBeNull();
  });

  it('shows the size of their Templates when there is no audience to show, and no meta row with nothing in it', async () => {
    const { container } = await showTheProfile({ kind: 'user', profile: { ...alice, created_at: null }, templates: [launch] });

    expect(stats()).toEqual(['1Templates', '1Checklist Items', '2Categories']);
    expect(screen.queryByText(/^Joined/)).toBeNull();
    expect(container.querySelector('[data-slot="detail-page-header"]')?.children).toHaveLength(3);
  });
});

describe("the Template cards on a public profile", () => {
  it('shows up to three categories and opens each Template at its canonical address', async () => {
    await showTheProfile({ kind: 'user', profile: alice, templates: [{ ...launch, categories: ['Launch', 'Marketing', 'SEO', 'Ads'] }] });

    const card = screen.getByRole('article');
    expect(within(card).getAllByText(/^(Launch|Marketing|SEO|Ads)$/).map((badge) => badge.textContent)).toEqual(['Launch', 'Marketing', 'SEO']);
    expect(within(card).getByRole('link', { name: 'Website Launch Checklist' }).getAttribute('href')).toBe('/profile/alice/website-launch/');
    expect(within(card).getByText('Launch workflow')).toBeTruthy();
  });

  it('shows a recipe with no categories and no owner to link, sending it to the library', async () => {
    const { ownerProfile, categories, ...unowned } = launch;
    await showTheProfile({
      kind: 'organization',
      organization: { avatar_url: null, description: null, handle: 'acme', name: 'Acme' },
      templates: [{ ...unowned, type: 'recipe', description: '' }],
    });

    const card = screen.getByRole('article');
    expect(within(card).getByRole('link', { name: 'Website Launch Checklist' }).getAttribute('href')).toBe('/templates/');
    expect(within(card).queryByText('Launch')).toBeNull();
    expect(within(card).getByText('Public template pack published by this Organization.')).toBeTruthy();
    expect(card.querySelector('svg.lucide-list')).toBeTruthy();
  });
});
