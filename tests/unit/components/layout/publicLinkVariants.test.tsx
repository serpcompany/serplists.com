import { navigation } from '../../../support/mockedNextNavigation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteNavigationMenu } from '@/components/layout/SiteNavigationMenu';

vi.mock('@/components/layout/publicSiteLinks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/layout/publicSiteLinks')>()),
  publicFooterGroups: [
    {
      title: 'Company',
      items: [
        { external: true, href: 'https://serp.co/', label: 'SERP' },
        { href: '/about/', label: 'About' },
      ],
    },
  ],
  publicHeaderItems: [{ kind: 'menu', label: 'Templates', links: [{ href: '/templates/', label: 'Template Library' }] }],
}));

const anchorTo = (html: string, href: string) => html.match(new RegExp(`<a[^>]*href="${href}"[^>]*>`))?.[0] ?? '';

describe('public links the shared data marks external or leaves undescribed', () => {
  it('opens an external footer link in a new tab without telling the other site where the visitor came from', () => {
    navigation.reset('/');
    const html = renderToStaticMarkup(<SiteFooter />);

    expect(anchorTo(html, 'https://serp.co/')).toMatch(/target="_blank"/);
    expect(anchorTo(html, 'https://serp.co/')).toMatch(/rel="noopener noreferrer"/);
    expect(anchorTo(html, '/about/')).not.toMatch(/target=/);
  });

  it('names a menu link with no description by its label alone', () => {
    navigation.reset('/');
    const html = renderToStaticMarkup(<SiteNavigationMenu />);
    const link = anchorTo(html, '/templates/');

    expect(link).toMatch(/aria-labelledby="[^"]+"/);
    expect(link).not.toMatch(/aria-describedby/);
    expect(html).not.toMatch(/id="[^"]*-description"/);
  });
});
