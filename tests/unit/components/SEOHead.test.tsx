import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SEOHead } from '@/components/shared/SEOHead';

type HelmetOutput = { link: { toString(): string }; meta: { toString(): string } };

const renderAt = (href: string, props: React.ComponentProps<typeof SEOHead> = {}) => {
  vi.stubGlobal('window', { location: new URL(href) });
  const helmetContext: { helmet?: HelmetOutput } = {};
  renderToStaticMarkup(
    <HelmetProvider context={helmetContext}>
      <SEOHead title="Camping" {...props} />
    </HelmetProvider>,
  );
  const helmet = helmetContext.helmet as HelmetOutput;
  return { link: helmet.link.toString(), meta: helmet.meta.toString() };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SEOHead host-dependent defaults', () => {
  it.each([
    'https://staging.serplists.com/profile/a/b?x=1#top',
    'https://serp-checklists.pages.dev/profile/a/b?x=1',
  ])('canonicalizes %s to production and marks it noindex', (href) => {
    const { link, meta } = renderAt(href);

    expect(link).toContain('href="https://serplists.com/profile/a/b"');
    expect(meta).toContain('property="og:url" content="https://serplists.com/profile/a/b"');
    expect(meta).toContain('name="robots" content="noindex, nofollow"');
    expect(meta).toContain('content="https://serplists.com/placeholder.svg"');
    expect(`${link}${meta}`).not.toContain('staging.serplists.com');
    expect(`${link}${meta}`).not.toContain('pages.dev');
  });

  it('indexes production pages under their canonical path', () => {
    const { link, meta } = renderAt('https://serplists.com/profile/a/b?utm_source=x');

    expect(link).toContain('href="https://serplists.com/profile/a/b"');
    expect(meta).toContain('name="robots" content="index, follow"');
  });

  it('keeps explicit robots and url props', () => {
    const { link, meta } = renderAt('https://serplists.com/share/token', {
      robots: 'noindex, nofollow',
      url: 'https://serplists.com/categories',
    });

    expect(link).toContain('href="https://serplists.com/categories"');
    expect(meta).toContain('name="robots" content="noindex, nofollow"');
  });
});
