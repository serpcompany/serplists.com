import '../../support/mockedNextNavigation';
import type { Metadata } from 'next';
import { describe, expect, it } from 'vitest';

import { metadata as categoriesMetadata } from '@/app/(site)/categories/page';
import { metadata as templatesMetadata } from '@/app/(site)/templates/page';
import { metadata as rootMetadata } from '@/app/layout';
import { metadata as notFoundMetadata } from '@/app/not-found';
import { APP_BRAND_NAME, SITE_DEFAULT_DESCRIPTION } from '@/lib/brand';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { stringMatching } from '../../support/asymmetricMatchers';
import { z } from 'zod';

const images = (value: unknown): unknown[] => z.array(z.unknown()).safeParse(value).data ?? (value ? [value] : []);

describe('root layout metadata, the defaults every page head starts from', () => {
  it('titles a page that sets no title with the brand, and brands the others once', () => {
    expect(rootMetadata.title).toEqual({ default: APP_BRAND_NAME, template: `%s | ${APP_BRAND_NAME}` });
  });

  it('gives every page the site description and link preview by default', () => {
    expect(rootMetadata.description).toBe(SITE_DEFAULT_DESCRIPTION);
    expect(rootMetadata.metadataBase?.toString()).toBe('https://serplists.com/');
    expect(rootMetadata.openGraph).toMatchObject({
      siteName: APP_BRAND_NAME,
      title: APP_BRAND_NAME,
      description: SITE_DEFAULT_DESCRIPTION,
      type: 'website',
    });
    expect(images(rootMetadata.openGraph?.images)).toHaveLength(1);
    expect(rootMetadata.twitter).toMatchObject({ card: 'summary_large_image' });
    expect(images(rootMetadata.twitter?.images)).toHaveLength(1);
  });

  it('leaves the viewport and charset to Next.js, which renders them once for every page', () => {
    expect(rootMetadata).not.toHaveProperty('viewport');
    expect(rootMetadata).not.toHaveProperty('charset');
  });
});

describe('page metadata', () => {
  const pages: Array<[string, Metadata]> = [
    ['/templates', templatesMetadata],
    ['/categories', categoriesMetadata],
    ['a page built from its PageSeo', buildPageMetadata({ title: 'Ultimate Camping Checklist', type: 'article' })],
  ];

  it.each(pages)(
    '%s replaces the defaults with a complete set of its own, image included, since Next.js replaces openGraph and twitter whole',
    (_page, metadata) => {
      expect(metadata.title).toEqual({ absolute: stringMatching(new RegExp(` \\| ${APP_BRAND_NAME}$`)) });
      expect(typeof metadata.description).toBe('string');
      expect(images(metadata.openGraph?.images)).toHaveLength(1);
      expect(images(metadata.twitter?.images)).toHaveLength(1);
      expect(metadata.openGraph?.title).toBe((metadata.title as { absolute: string }).absolute);
    },
  );

  it('keeps the 404 page out of search without naming a canonical URL or preview', () => {
    expect(notFoundMetadata.robots).toMatch(/^noindex/);
    expect(notFoundMetadata.alternates).toBeUndefined();
    expect(notFoundMetadata.openGraph).toBeUndefined();
  });
});
