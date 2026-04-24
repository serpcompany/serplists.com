import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import Index from '@/pages/Index';

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    user: null,
  }),
}));

vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplates: () => ({
    templates: [],
    templatesLoading: false,
  }),
}));

describe('Index layout', () => {
  it('keeps the standalone v0 reference framing and docs hrefs on the homepage route', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Index />
      </MemoryRouter>,
    );

    expect(html).toContain('Checklist Product Prototype');
    expect(html).toContain('mx-auto flex h-14 max-w-4xl items-center justify-between px-4');
    expect(html).toContain('mx-auto max-w-4xl px-4 py-8 md:py-12');
    expect(html).toContain('Design System Documentation');
    expect(html).not.toContain('max-w-6xl');
    expect(html).toContain('href="/docs"');
    expect(html).not.toContain('href="/dashboard/templates"');
  });
});
