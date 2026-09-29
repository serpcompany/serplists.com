import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import Index from '@/views/Index';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

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
    navigation.reset('/');
    const html = renderToStaticMarkup(
      <Index />,
    );

    expect(html).toContain('Build the checklist once. Run it every time.');
    expect(html).toContain('Template library');
    expect(html).toContain('Live run tracking');
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
