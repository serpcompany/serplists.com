import { navigation } from '../../support/mockedNextNavigation';
import { shownConsole } from '../../support/mockedConsoleContext';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { organizationConsole, PERSONAL_CONSOLE } from '@/lib/consoleRoutes';
import Index from '@/views/Index';
import type { ChecklistTemplate } from '@/types/checklist';
import { bundledTemplate, movingTemplate } from '../../support/mockedTemplateLibrary';

const visitor = vi.hoisted(() => ({ user: null as { id: string } | null }));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => visitor,
}));

const catalog = vi.hoisted(() => ({ templates: [] as ChecklistTemplate[], templatesLoading: false }));

vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplates: () => catalog,
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

describe('Index starter library', () => {
  const starter = (id: string, overrides: Partial<ChecklistTemplate> = {}): ChecklistTemplate => ({
    ...bundledTemplate,
    id: `repo:${id}`,
    slug: id,
    title: `Starter ${id}`,
    ...overrides,
  });

  const renderTheHomePage = (templates: ChecklistTemplate[], templatesLoading = false) => {
    Object.assign(catalog, { templates, templatesLoading });
    navigation.reset('/');
    try {
      return renderToStaticMarkup(<Index />);
    } finally {
      Object.assign(catalog, { templates: [], templatesLoading: false });
    }
  };

  it('says the starter templates are loading until the catalog arrives', () => {
    const html = renderTheHomePage([], true);

    expect(html).toContain('Loading templates...');
    expect(html).not.toContain('href="/profile/serp/');
  });

  it('features the first three starter templates of the repository, each at its public address, and no community template', () => {
    const html = renderTheHomePage([
      movingTemplate,
      starter('camping', { description: 'Everything for a night outside.', categories: ['outdoor', 'travel', 'family', 'summer'] }),
      starter('dinner', { type: 'recipe', description: '', categories: [] }),
      starter('moving'),
      starter('fourth'),
    ]);

    expect(html.match(/href="\/profile\/serp\/[^"]+"/g)).toEqual([
      'href="/profile/serp/camping/"',
      'href="/profile/serp/dinner/"',
      'href="/profile/serp/moving/"',
    ]);
    expect(html).not.toContain(movingTemplate.title);
    expect(html).toContain('Everything for a night outside.');
    expect(html).toContain('No description yet.');
    expect(html).toContain('>travel<');
    expect(html).toContain('>family<');
    expect(html).not.toContain('>summer<');
    expect(html).toContain('0 items in 0 sections');
  });

  it('counts the items and sections of a featured starter template', () => {
    const html = renderTheHomePage([
      starter('trip', {
        sections: [
          { id: 's1', title: 'Pack', items: [{ id: 'i1', title: 'Tent' }, { id: 'i2', title: 'Stove' }] },
        ],
      }),
    ]);

    expect(html).toContain('2 items in 1 section');
  });

  it('marks a recipe with the list icon and a checklist with the document icon', () => {
    const iconsOf = (html: string) => html.match(/lucide-(?:list|file-text)(?=")/g);

    expect(iconsOf(renderTheHomePage([starter('dinner', { type: 'recipe' })]))).toEqual(['lucide-list']);
    expect(iconsOf(renderTheHomePage([starter('camping')]))).toEqual(['lucide-file-text']);
  });
});
