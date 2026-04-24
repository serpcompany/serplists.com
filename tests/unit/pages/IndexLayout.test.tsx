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
  it('explains the actual template to run to share workflow instead of generic marketing cards', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Index />
      </MemoryRouter>,
    );

    expect(html).toContain('Build the checklist once. Run it every time.');
    expect(html).toContain('Template library');
    expect(html).toContain('Live run workspace');
    expect(html).toContain('Shareable proof');
    expect(html).toContain('1');
    expect(html).toContain('2');
    expect(html).toContain('3');
    expect(html).toContain('Make a template');
    expect(html).toContain('Run the workflow');
    expect(html).toContain('Share the result');
    expect(html).not.toContain('Checklist Product Prototype');
    expect(html).not.toContain('Create and Run Checklists for Your Processes');
  });
});
