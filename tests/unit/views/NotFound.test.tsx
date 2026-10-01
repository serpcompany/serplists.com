import '../../support/mockedNextNavigation';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FeaturePage, { generateMetadata as generateFeatureMetadata } from '@/app/(site)/features/[featureSlug]/page';
import NotFoundPage, { metadata as notFoundMetadata } from '@/app/not-found';
import { APP_BRAND_NAME } from '@/lib/brand';
import NotFound from '@/views/NotFound';
import { createFakeContainer, installFakeDomGlobals } from '../../fixtures/fakeDom';
import { navigation } from '../../support/nextNavigation';

vi.mock('server-only', () => ({}));

vi.mock('@/components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div data-layout="">{children}</div>,
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ sessionStatus: 'loading' }),
}));

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const params = (featureSlug: string) => ({ params: Promise.resolve({ featureSlug }) });

describe('NotFound page head, which tells crawlers itself not to index a missing page', () => {
  it('tells crawlers not to index an unknown route', () => {
    navigation.reset('/definitely-missing');
    const html = renderToStaticMarkup(<NotFoundPage />);

    expect(html).toContain('That page does not exist');
    expect(notFoundMetadata.robots).toMatch(/^noindex/);
    expect(notFoundMetadata.title).toEqual({ absolute: `Page not found | ${APP_BRAND_NAME}` });
  });

  it('names no address in the server HTML, which Next.js prerenders once and serves for every missing address', () => {
    navigation.reset('/definitely-missing');
    const html = renderToStaticMarkup(<NotFoundPage />);

    expect(html).toContain('This route could not be found.');
    expect(html).not.toContain('/definitely-missing');
  });

  it('names the missing address once the page runs in the browser', async () => {
    const restoreGlobals = installFakeDomGlobals(navigation.window);
    try {
      navigation.reset('/definitely-missing');
      const container = createFakeContainer();
      const root = createRoot(container as unknown as HTMLElement);
      await act(async () => {
        root.render(<NotFound />);
      });

      expect(container.textContent).toContain('The route /definitely-missing could not be found.');
      act(() => root.unmount());
    } finally {
      restoreGlobals();
    }
  });

  it('logs no error for a missing address, which is not an error in the app', async () => {
    const restoreGlobals = installFakeDomGlobals(navigation.window);
    try {
      navigation.reset('/definitely-missing');
      const container = createFakeContainer();
      const root = createRoot(container as unknown as HTMLElement);
      await act(async () => {
        root.render(<NotFound />);
      });
      act(() => root.unmount());

      expect(container.textContent).toBe('');
      expect(console.error).not.toHaveBeenCalled();
    } finally {
      restoreGlobals();
    }
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
