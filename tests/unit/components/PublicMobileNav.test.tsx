import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { PublicMobileMenu } from '@/components/layout/PublicMobileNav';
import { publicHeaderLinks } from '@/components/layout/publicSiteLinks';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

const renderMenu = (pathname: string, signedIn: boolean) => {
  navigation.reset(pathname);
  return renderToStaticMarkup(
    <PublicMobileMenu onNavigate={() => undefined} pathname={pathname} signedIn={signedIn} />,
  );
};

describe('PublicMobileMenu', () => {
  it('gives visitors every header link plus Log in and Get started', () => {
    const html = renderMenu('/', false);

    publicHeaderLinks.forEach((link) => {
      expect(html).toContain(`href="${link.href}"`);
      expect(html).toContain(`>${link.label}</a>`);
    });
    expect(html).toContain('href="/login"');
    expect(html).toContain('>Log in</a>');
    expect(html).toContain('href="/register"');
    expect(html).toContain('>Get started</a>');
    expect(html).not.toContain('>Dashboard</a>');
  });

  it('gives signed-in users the dashboard instead of the sign-in actions', () => {
    const html = renderMenu('/templates', true);

    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('>Dashboard</a>');
    expect(html).not.toContain('href="/login"');
    expect(html).not.toContain('href="/register"');
  });

  it('marks the current section and offers the theme switch', () => {
    const html = renderMenu('/pricing', false);

    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/pricing"|<a[^>]*href="\/pricing"[^>]*aria-current="page"/);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('Switch to dark mode');
  });
});
