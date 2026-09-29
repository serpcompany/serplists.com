import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Features from '@/views/Features';
import NotFound from '@/views/NotFound';
import { APP_BRAND_NAME } from '@/lib/brand';

// Cloudflare Pages answers unknown paths with index.html and a 200, so the 404 page has to
// tell crawlers itself that it is not a page to index (a soft 404 otherwise).

interface HelmetOutput {
  link: { toString(): string };
  meta: { toString(): string };
  script: { toString(): string };
  title: { toString(): string };
}

const renderWithHead = (location: string, routes: React.ReactNode) => {
  const context: { helmet?: HelmetOutput } = {};
  const html = renderToStaticMarkup(
    <HelmetProvider context={context}>
      <StaticRouter location={location}>
        <Routes>{routes}</Routes>
      </StaticRouter>
    </HelmetProvider>,
  );
  return { helmet: context.helmet!, html };
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NotFound page head', () => {
  it('tells crawlers not to index an unknown route', () => {
    const { helmet, html } = renderWithHead(
      '/definitely-missing',
      <Route path="*" element={<NotFound />} />,
    );

    expect(html).toContain('That page does not exist');
    expect(helmet.meta.toString()).toMatch(/name="robots" content="noindex[^"]*"/);
    expect(helmet.title.toString()).toContain(`>Page not found | ${APP_BRAND_NAME}</title>`);
  });

  it('declares no canonical URL for the missing address', () => {
    const { helmet } = renderWithHead(
      '/definitely-missing',
      <Route path="*" element={<NotFound />} />,
    );

    expect(helmet.link.toString()).not.toContain('canonical');
    expect(helmet.meta.toString()).not.toContain('og:url');
    expect(helmet.script.toString()).not.toContain('ld+json');
  });
});

describe('Feature pages', () => {
  const featureRoutes = <Route path="/features/:featureSlug" element={<Features />} />;

  it('noindexes an unknown feature slug', () => {
    const { helmet, html } = renderWithHead('/features/definitely-missing', featureRoutes);

    expect(html).toContain('That page does not exist');
    expect(helmet.meta.toString()).toMatch(/name="robots" content="noindex/);
  });

  it('leaves a real feature page indexable', () => {
    const { helmet, html } = renderWithHead('/features/template-builder', featureRoutes);

    expect(html).toContain('Template Builder');
    expect(helmet.meta.toString()).not.toContain('noindex');
  });
});
