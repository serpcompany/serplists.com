import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SEOHead } from '@/components/shared/SEOHead';
import { APP_BRAND_NAME } from '@/lib/brand';

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
  vi.unstubAllGlobals();
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

describe('SEOHead branding', () => {
  const allOutput = (helmet: HelmetOutput) =>
    [helmet.title, helmet.meta, helmet.link, helmet.script].map(String).join('\n');

  it('titles pages and social cards with the product brand', () => {
    const helmet = renderHead({ title: 'Discover Templates' });

    expect(helmet.title.toString()).toContain(`>Discover Templates | ${APP_BRAND_NAME}</title>`);
    expect(helmet.meta.toString()).toContain(`property="og:title" content="Discover Templates | ${APP_BRAND_NAME}"`);
    expect(helmet.meta.toString()).toContain(`property="og:site_name" content="${APP_BRAND_NAME}"`);
    expect(allOutput(helmet)).not.toContain('Checklist App');
  });

  it('uses the brand alone when no title is given', () => {
    const helmet = renderHead({});

    expect(helmet.title.toString()).toContain(`>${APP_BRAND_NAME}</title>`);
    expect(allOutput(helmet)).not.toContain('Checklist App');
  });

  it('keeps a blank shared run title from producing an empty page title', () => {
    const helmet = renderHead({ title: '  ', robots: 'noindex, nofollow' });

    expect(helmet.title.toString()).toContain(`>${APP_BRAND_NAME}</title>`);
  });

  it('names the site as publisher of an article and a person only when an author is given', () => {
    const anonymous = renderHead({ title: 'Audit', type: 'article', publishedTime: '2026-01-01' });
    expect(anonymous.script.toString()).toContain(
      `"publisher":{"@type":"Organization","name":"${APP_BRAND_NAME}"}`,
    );
    expect(anonymous.script.toString()).not.toContain('"author"');

    const authored = renderHead({ title: 'Audit', type: 'article', publishedTime: '2026-01-01', author: 'Alice' });
    expect(authored.script.toString()).toContain('"author":{"@type":"Person","name":"Alice"}');
  });
});

const renderAt = (href: string, props: React.ComponentProps<typeof SEOHead> = {}) => {
  vi.stubGlobal('window', { location: new URL(href) });
  const helmetContext: { helmet?: HelmetOutput } = {};
  renderToStaticMarkup(
    <HelmetProvider context={helmetContext}>
      <SEOHead title="Camping" {...props} />
    </HelmetProvider>,
  );
  const helmet = helmetContext.helmet as Pick<HelmetOutput, 'link' | 'meta'>;
  return { link: helmet.link.toString(), meta: helmet.meta.toString() };
};

describe('SEOHead host-dependent defaults', () => {
  it.each([
    'https://staging.serplists.com/profile/a/b?x=1#top',
    'https://serp-checklists.pages.dev/profile/a/b?x=1',
  ])('canonicalizes %s to production and marks it noindex', (href) => {
    const { link, meta } = renderAt(href);

    expect(link).toContain('href="https://serplists.com/profile/a/b"');
    expect(meta).toContain('property="og:url" content="https://serplists.com/profile/a/b"');
    expect(meta).toContain('name="robots" content="noindex, nofollow"');
    expect(meta).toContain('property="og:image" content="https://serplists.com/');
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
