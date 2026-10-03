import { navigation } from '../../support/mockedNextNavigation';
import { shownConsole } from '../../support/mockedConsoleContext';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { organizationConsole, PERSONAL_CONSOLE } from '@/lib/consoleRoutes';
import Index from '@/views/Index';

const visitor = vi.hoisted(() => ({ user: null as { id: string } | null }));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => visitor,
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
    expect(html).toContain('Template Library');
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

  it("opens the dashboard of the context the tab is in for a signed-in user", () => {
    navigation.reset('/');
    visitor.user = { id: 'user-1' };
    try {
      expect(renderToStaticMarkup(<Index />)).toContain('href="/dashboard/templates/"');

      shownConsole.context = organizationConsole('team-1');
      expect(renderToStaticMarkup(<Index />)).toContain('href="/dashboard/organization/team-1/templates/"');
    } finally {
      visitor.user = null;
      shownConsole.context = PERSONAL_CONSOLE;
    }
  });
});
