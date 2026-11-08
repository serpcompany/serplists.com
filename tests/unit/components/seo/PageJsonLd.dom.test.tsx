import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PageJsonLd } from '@/components/seo/PageJsonLd';
import { buildPageJsonLd, type PageSeo } from '@/lib/seo/pageMetadata';

const seo: PageSeo = { title: 'Shared run', description: 'A run shared from SERP Lists', path: '/share/abc123/' };

const structuredDataIn = (markup: string): unknown[] =>
  [...new DOMParser().parseFromString(markup, 'text/html').querySelectorAll('script[type="application/ld+json"]')].map(
    (script): unknown => JSON.parse(script.textContent),
  );

describe("a page's structured data", () => {
  it('writes the structured data of the page once its SEO has loaded', async () => {
    const markup = renderToStaticMarkup(await PageJsonLd({ seo: Promise.resolve(seo) }));

    expect(structuredDataIn(markup)).toEqual([buildPageJsonLd(seo)]);
  });

  it('writes nothing for a page that has no SEO, such as a share link that no longer works', async () => {
    expect(await PageJsonLd({ seo: Promise.resolve(null) })).toBeNull();
  });
});
