import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DocumentHeadProvider } from '@/components/shared/DocumentHeadProvider';
import { SEOHead } from '@/components/shared/SEOHead';
import { APP_BRAND_NAME } from '@/lib/brand';

// react-helmet-async leaves document.title alone when the last page title unmounts, so
// without a default a page that sets no title (Pricing, the dashboard) keeps the title of
// the page before it. The server render uses the same reducer as the browser.

interface HelmetOutput {
  title: { toString(): string };
}

const renderTitle = (children: React.ReactNode): string => {
  const context: { helmet?: HelmetOutput } = {};
  renderToStaticMarkup(<DocumentHeadProvider context={context}>{children}</DocumentHeadProvider>);
  return context.helmet!.title.toString();
};

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { origin: 'https://serplists.com', pathname: '/templates' } },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

describe('DocumentHeadProvider', () => {
  it('titles a page that sets no title with the brand', () => {
    expect(renderTitle(<main>Pricing</main>)).toContain(`>${APP_BRAND_NAME}</title>`);
  });

  it('lets a page title win over the default', () => {
    expect(renderTitle(<SEOHead title="Discover Templates" />)).toContain(
      `>Discover Templates | ${APP_BRAND_NAME}</title>`,
    );
  });

  it('wraps the whole app, including routes outside the public layout', () => {
    const app = readFileSync('src/App.tsx', 'utf8');

    expect(app).toContain('<DocumentHeadProvider>');
    expect(app).not.toMatch(/<HelmetProvider\b/);
  });
});
