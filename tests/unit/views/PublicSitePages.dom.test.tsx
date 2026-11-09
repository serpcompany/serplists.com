import { navigation } from '../../support/mockedNextNavigation';
import React from 'react';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FEATURES } from '@/data/publicFeatures';
import About from '@/views/About';
import Contact from '@/views/Contact';
import Features from '@/views/Features';
import { renderSettled, theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';

theInMemoryBrowserAsTheWindow();
afterEach(() => cleanup());

const hrefOfLink = (name: string) => screen.getByRole('link', { name }).getAttribute('href');

describe('About page', () => {
  it('states what SERP Lists is for and sends the reader on to Features or Contact', async () => {
    navigation.reset('/about/');
    await renderSettled(<About />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Build repeatable work that feels easy to discover and execute.',
    );
    expect(hrefOfLink('Explore Features')).toBe('/features/');
    expect(hrefOfLink('Contact Us')).toBe('/contact/');
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Clarity',
      'Consistency',
      'Community',
    ]);
  });
});

describe('Contact page', () => {
  it('offers support by email and a feedback email with its subject filled in', async () => {
    navigation.reset('/contact/');
    await renderSettled(<Contact />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Talk to the team behind SERP Lists.');
    expect(hrefOfLink('support@serplists.com')).toBe('mailto:support@serplists.com');
    expect(hrefOfLink('Share feedback')).toBe('mailto:support@serplists.com?subject=SERP%20Lists%20feedback');
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Email support',
      'Product feedback',
    ]);
  });
});

describe('Features index, the page with no feature slug', () => {
  it('lists every feature with a link to its own page, and links to Pricing and the Template Library', async () => {
    navigation.reset('/features/', { routes: ['/features/'] });
    await renderSettled(<Features />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Features that keep work consistent.');
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(
      FEATURES.map((feature) => feature.title),
    );
    for (const feature of FEATURES) {
      expect(hrefOfLink(feature.title)).toBe(`/features/${feature.slug}/`);
    }
    expect(hrefOfLink('See Pricing')).toBe('/pricing/');
    expect(hrefOfLink('Browse the Template Library')).toBe('/templates/');
  });
});
