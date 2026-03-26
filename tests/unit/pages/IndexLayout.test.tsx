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
  it('positions the homepage as a form-first workflow instead of a broad marketplace pitch', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Index />
      </MemoryRouter>,
    );

    expect(html).toContain('Build the template once. Run it every time.');
    expect(html).toContain('Template editing');
    expect(html).toContain('Run execution');
    expect(html).not.toContain(
      'Turn messy repeat work into templates people can actually discover and run.',
    );
  });
});
