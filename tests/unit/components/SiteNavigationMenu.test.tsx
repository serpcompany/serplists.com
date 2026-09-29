import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { SiteNavigationMenu } from '@/components/layout/SiteNavigationMenu';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

// The site header's navigation (and the console top bar's): "Templates" and "Features" open
// menus of their pages, "Pricing" is a link.

const renderAt = (pathname: string) => {
  navigation.reset(pathname);
  return renderToStaticMarkup(<SiteNavigationMenu />);
};

// The trigger button for a menu, and the (closed, hidden) content that follows it.
const menu = (html: string, label: string) => {
  const trigger = html.match(new RegExp(`<button[^>]*>${label} <svg`))?.[0] ?? '';
  const start = html.indexOf('</button>', html.indexOf(trigger)) + '</button>'.length;
  const content = html.slice(start, html.indexOf('</ul>', start));
  return { trigger, content };
};

// A link's accessible name and description: the texts its aria-labelledby and
// aria-describedby point at.
const textById = (html: string, id: string | undefined) =>
  id ? html.match(new RegExp(`id="${id}"[^>]*>([^<]*)<`))?.[1] : undefined;
const describeLink = (html: string, href: string) => {
  const tag = html.match(new RegExp(`<a href="${href}"[^>]*>`))?.[0] ?? '';
  return {
    current: /aria-current="page"/.test(tag),
    description: textById(html, tag.match(/aria-describedby="([^"]+)"/)?.[1]),
    name: textById(html, tag.match(/aria-labelledby="([^"]+)"/)?.[1]),
  };
};

describe('SiteNavigationMenu', () => {
  it('opens Templates and Features as menus from buttons and keeps Pricing a link', () => {
    const html = renderAt('/');

    expect(html).toMatch(/<nav[^>]*aria-label="Site"/);
    for (const label of ['Templates', 'Features']) {
      expect(menu(html, label).trigger, label).toMatch(/type="button"[^>]*aria-expanded="false"/);
    }
    expect(html).toMatch(/<a href="\/pricing\/"[^>]*>Pricing<\/a>/);
    expect(html).not.toMatch(/<a href="\/templates\/"[^>]*>Templates<\/a>/);
    expect(html).not.toContain('href="/features/"');
  });

  // Closed menus stay in the HTML, hidden, so crawlers still find the pages they link.
  it('lists the Template Library and Categories under Templates, and the four feature pages under Features', () => {
    const html = renderAt('/');
    const templates = menu(html, 'Templates').content;
    const features = menu(html, 'Features').content;

    expect(templates).toMatch(/^<div[^>]*hidden=""/);
    expect([...templates.matchAll(/<a href="([^"]+)"/g)].map((match) => match[1])).toEqual([
      '/templates/',
      '/categories/',
    ]);
    expect([...features.matchAll(/<a href="([^"]+)"/g)].map((match) => match[1])).toEqual([
      '/features/template-builder/',
      '/features/checklist-runs/',
      '/features/public-sharing/',
      '/features/import-export/',
    ]);
    expect(describeLink(html, '/templates/')).toEqual({
      current: false,
      description: 'Browse hundreds of ready-to-use checklist templates created by the community.',
      name: 'Template Library',
    });
    expect(describeLink(html, '/categories/').name).toBe('Categories');
    expect(describeLink(html, '/features/import-export/').name).toBe('Import + Export');
  });

  it.each([
    ['/templates/', 'Templates', '/templates/'],
    ['/categories/business/', 'Templates', '/categories/'],
    ['/features/public-sharing/', 'Features', '/features/public-sharing/'],
  ])('on %s marks the %s menu and the current page’s link', (pathname, active, href) => {
    const html = renderAt(pathname);

    for (const label of ['Templates', 'Features']) {
      expect(menu(html, label).trigger.includes('data-active=""'), label).toBe(label === active);
    }
    expect(describeLink(html, href).current).toBe(true);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it('marks the Features menu on the features overview, which it does not list', () => {
    const html = renderAt('/features/');

    expect(menu(html, 'Features').trigger).toContain('data-active=""');
    expect(menu(html, 'Templates').trigger).not.toContain('data-active=""');
    expect(html).not.toContain('aria-current="page"');
  });

  it('marks Pricing as the current page there', () => {
    expect(renderAt('/pricing/')).toMatch(/<a href="\/pricing\/"[^>]*aria-current="page"/);
  });
});
