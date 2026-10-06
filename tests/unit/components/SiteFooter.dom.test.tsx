import '../../support/mockedNextNavigation';
import React from 'react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SiteFooter } from '@/components/layout/SiteFooter';
import { renderSettled, theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';

theInMemoryBrowserAsTheWindow();

describe('the site footer', () => {
  it("links SERP Lists' social profiles by name, each opening in a new tab with its logo hidden from screen readers", async () => {
    await renderSettled(<SiteFooter />);

    const socials = within(screen.getByRole('list', { name: 'SERP Lists on social media' })).getAllByRole('link');

    expect(socials.map((link) => [link.getAttribute('aria-label'), link.getAttribute('href')])).toEqual([
      ['SERP Lists on YouTube', 'https://www.youtube.com/@serplists'],
      ['SERP Lists on Facebook', 'https://www.facebook.com/serplists'],
      ['SERP Lists on LinkedIn', 'https://www.linkedin.com/company/serplists'],
      ['SERP Lists on GitHub', 'https://github.com/serplists'],
      ['SERP Lists on Medium', 'https://medium.com/@serplists'],
      ['SERP Lists on Instagram', 'https://www.instagram.com/serplists/'],
      ['SERP Lists on X', 'https://x.com/serplists'],
      ['SERP Lists on Reddit', 'https://www.reddit.com/r/serplists/'],
    ]);
    for (const link of socials) {
      expect(link.getAttribute('target'), link.getAttribute('aria-label') ?? '').toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      expect(link.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
      expect(link.querySelector('svg path')?.getAttribute('d')).toMatch(/^M/);
    }
  });
});
