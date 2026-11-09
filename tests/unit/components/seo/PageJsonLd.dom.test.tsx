import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PageJsonLd } from '@/components/seo/PageJsonLd';
import type { PageSeo } from '@/lib/seo/pageMetadata';

import { objectContaining, stringContaining, stringMatching } from '../../../support/asymmetricMatchers';

const seo: PageSeo = { title: 'Shared run', description: 'A run shared from SERP Lists', path: '/share/abc123/' };

const structuredDataIn = (markup: string): unknown[] =>
  [...new DOMParser().parseFromString(markup, 'text/html').querySelectorAll('script[type="application/ld+json"]')].map(
    (script): unknown => JSON.parse(script.textContent),
  );

describe("a page's structured data", () => {
  it('writes the structured data of the page once its SEO has loaded', async () => {
    const markup = renderToStaticMarkup(await PageJsonLd({ seo: Promise.resolve(seo) }));

    expect(structuredDataIn(markup)).toEqual([
      objectContaining({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: stringContaining('Shared run'),
        description: 'A run shared from SERP Lists',
        url: stringMatching(/^https:\/\/[^/]+\/share\/abc123\/$/),
      }),
    ]);
  });

  it('writes nothing for a page that has no SEO, such as a share link that no longer works', async () => {
    expect(await PageJsonLd({ seo: Promise.resolve(null) })).toBeNull();
  });
});
