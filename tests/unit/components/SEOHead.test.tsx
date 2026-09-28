import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, describe, expect, it } from 'vitest';

import { SEOHead } from '@/components/shared/SEOHead';

interface HelmetOutput {
  link: { toString(): string };
  meta: { toString(): string };
  script: { toString(): string };
  title: { toString(): string };
}

const PAGE_LOCATION = {
  href: 'https://serplists.com/categories/seo?utm_source=twitter&fbclid=abc#top',
  origin: 'https://serplists.com',
  pathname: '/categories/seo',
  search: '?utm_source=twitter&fbclid=abc',
  hash: '#top',
};

function renderHead(props: React.ComponentProps<typeof SEOHead>, location = PAGE_LOCATION): HelmetOutput {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location } });
  const context: { helmet?: HelmetOutput } = {};
  renderToStaticMarkup(
    <HelmetProvider context={context}>
      <SEOHead {...props} />
    </HelmetProvider>,
  );
  return context.helmet!;
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

describe('SEOHead page URL', () => {
  it('drops the query string and hash when no url is passed', () => {
    const helmet = renderHead({ title: 'SEO' });

    expect(helmet.link.toString()).toContain('rel="canonical" href="https://serplists.com/categories/seo"');
    expect(helmet.meta.toString()).toContain('property="og:url" content="https://serplists.com/categories/seo"');
    expect(helmet.script.toString()).toContain('"url":"https://serplists.com/categories/seo"');
    for (const output of [helmet.link, helmet.meta, helmet.script]) {
      expect(output.toString()).not.toContain('utm_source');
      expect(output.toString()).not.toContain('#top');
    }
  });

  it('uses an explicit url as given', () => {
    const helmet = renderHead({ title: 'SEO', url: 'https://serplists.com/templates' });

    expect(helmet.link.toString()).toContain('rel="canonical" href="https://serplists.com/templates"');
    expect(helmet.meta.toString()).toContain('property="og:url" content="https://serplists.com/templates"');
  });
});
