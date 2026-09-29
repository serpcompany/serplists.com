import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FeaturePage, { generateMetadata as generateFeatureMetadata } from '@/app/(site)/features/[featureSlug]/page';
import NotFoundPage, { metadata as notFoundMetadata } from '@/app/not-found';
import { APP_BRAND_NAME } from '@/lib/brand';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);
// The route files read their params through src/server, which only the server may import.
vi.mock('server-only', () => ({}));

// A 404 must tell crawlers itself that it is not a page to index (a soft 404 otherwise):
// unknown paths render src/app/not-found.tsx, and a feature page with an unknown slug shows
// the same page with the same head.

vi.mock('@/components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div data-layout="">{children}</div>,
}));

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const params = (featureSlug: string) => ({ params: Promise.resolve({ featureSlug }) });

describe('NotFound page head', () => {
  it('tells crawlers not to index an unknown route', () => {
    navigation.reset('/definitely-missing');
    const html = renderToStaticMarkup(<NotFoundPage />);

    expect(html).toContain('That page does not exist');
    expect(html).toContain('The route /definitely-missing could not be found.');
    expect(notFoundMetadata.robots).toMatch(/^noindex/);
    expect(notFoundMetadata.title).toEqual({ absolute: `Page not found | ${APP_BRAND_NAME}` });
  });

  it('declares no canonical URL for the missing address', () => {
    navigation.reset('/definitely-missing');
    const html = renderToStaticMarkup(<NotFoundPage />);

    expect(notFoundMetadata.alternates).toBeUndefined();
    expect(notFoundMetadata.openGraph).toBeUndefined();
    expect(html).not.toContain('ld+json');
  });
});

describe('Feature pages', () => {
  it('noindexes an unknown feature slug', async () => {
    navigation.reset('/features/definitely-missing', { routes: ['/features/[featureSlug]'] });
    const html = renderToStaticMarkup(await FeaturePage(params('definitely-missing')));
    const metadata = await generateFeatureMetadata(params('definitely-missing'));

    expect(html).toContain('That page does not exist');
    expect(metadata.robots).toMatch(/^noindex/);
    expect(metadata.title).toEqual({ absolute: `Page not found | ${APP_BRAND_NAME}` });
  });

  it('leaves a real feature page indexable', async () => {
    navigation.reset('/features/template-builder', { routes: ['/features/[featureSlug]'] });
    const html = renderToStaticMarkup(await FeaturePage(params('template-builder')));
    const metadata = await generateFeatureMetadata(params('template-builder'));

    expect(html).toContain('Template Builder');
    expect(html).not.toContain('That page does not exist');
    expect(metadata.robots).toBeUndefined();
  });
});
