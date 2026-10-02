import { describe, expect, it } from 'vitest';

import { APP_BRAND_NAME } from '@/lib/brand';
import { buildPageJsonLd, buildPageMetadata, type PageSeo } from '@/lib/seo/pageMetadata';

const allText = (seo: PageSeo) => JSON.stringify([buildPageMetadata(seo), buildPageJsonLd(seo)]);

interface PageJsonLd extends Record<string, unknown> {
  url?: unknown;
  publisher?: unknown;
  datePublished?: unknown;
}

describe('page metadata URL', () => {
  it('names the production URL of the page path in the canonical link, og:url and JSON-LD', () => {
    const seo: PageSeo = { title: 'SEO', path: '/categories/seo/' };
    const metadata = buildPageMetadata(seo);

    expect(metadata.alternates?.canonical).toBe('https://serplists.com/categories/seo/');
    expect(metadata.openGraph?.url).toBe('https://serplists.com/categories/seo/');
    const jsonLd: PageJsonLd = buildPageJsonLd(seo);
    expect(jsonLd.url).toBe('https://serplists.com/categories/seo/');
  });

  it('never carries a query string or hash into the canonical URL', () => {
    const metadata = buildPageMetadata({ title: 'SEO', path: '/categories/seo/?utm_source=twitter&fbclid=abc#top' });

    expect(metadata.alternates?.canonical).toBe('https://serplists.com/categories/seo/');
    expect(allText({ title: 'SEO', path: '/categories/seo?utm_source=twitter#top' })).not.toMatch(/utm_source|#top/);
  });

  it('declares no canonical URL for a page without a path', () => {
    const metadata = buildPageMetadata({ title: 'Somewhere' });

    expect(metadata.alternates).toBeUndefined();
    expect(metadata.openGraph?.url).toBeUndefined();
    expect(buildPageJsonLd({ title: 'Somewhere' })).not.toHaveProperty('url');
  });
});

describe('page metadata branding', () => {
  it('titles pages and social cards with the product brand, once', () => {
    const metadata = buildPageMetadata({ title: 'Template Library' });

    expect(metadata.title).toEqual({ absolute: `Template Library | ${APP_BRAND_NAME}` });
    expect(metadata.openGraph?.title).toBe(`Template Library | ${APP_BRAND_NAME}`);
    expect(metadata.openGraph?.siteName).toBe(APP_BRAND_NAME);
    expect(metadata.twitter?.title).toBe(`Template Library | ${APP_BRAND_NAME}`);
    expect(buildPageMetadata({ title: `Pricing | ${APP_BRAND_NAME}` }).title).toEqual({
      absolute: `Pricing | ${APP_BRAND_NAME}`,
    });
    expect(allText({ title: 'Template Library' })).not.toContain('Checklist App');
  });

  it('keeps a blank shared run title from producing an empty page title', () => {
    expect(buildPageMetadata({ title: '  ', robots: 'noindex, nofollow' }).title).toEqual({ absolute: APP_BRAND_NAME });
  });

  it('names the site as the publisher of an article', () => {
    const jsonLd: PageJsonLd = buildPageJsonLd({ title: 'Audit', type: 'article', publishedTime: '2026-01-01' });

    expect(jsonLd['@type']).toBe('Article');
    expect(jsonLd.publisher).toEqual({ '@type': 'Organization', name: APP_BRAND_NAME });
    expect(jsonLd.datePublished).toBe('2026-01-01');
    expect(jsonLd).not.toHaveProperty('author');
    expect(buildPageMetadata({ title: 'Audit', type: 'article', publishedTime: '2026-01-01' }).openGraph).toMatchObject({
      type: 'article',
      publishedTime: '2026-01-01',
    });
  });

  it('describes other pages as the website, with the default description and keywords', () => {
    const metadata = buildPageMetadata({ title: 'About' });

    expect(buildPageJsonLd({ title: 'About' })['@type']).toBe('WebSite');
    expect(metadata.openGraph).toMatchObject({ type: 'website' });
    expect(metadata.description).toMatch(/checklists/i);
    expect(metadata.keywords).toContain('checklist');
  });
});

describe('page metadata robots', () => {
  it('indexes a page unless it says otherwise', () => {
    expect(buildPageMetadata({ title: 'Camping', path: '/profile/a/b' }).robots).toBe('index, follow');
  });

  it('keeps an explicit robots rule', () => {
    expect(buildPageMetadata({ title: 'Shared run', robots: 'noindex, nofollow' }).robots).toBe('noindex, nofollow');
  });

  it('never names the host that served the page, since every environment names the production URL', () => {
    const text = allText({ title: 'Camping', path: '/profile/a/b' });

    expect(text).not.toMatch(/staging\.serplists\.com|workers\.dev|pages\.dev|localhost/);
  });
});
