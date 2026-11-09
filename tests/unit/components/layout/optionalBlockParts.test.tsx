import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DashboardEmptyState } from '@/components/dashboard/DashboardContentShell';
import { CtaBanner } from '@/components/layout/CtaBanner';
import { DetailPageLayout } from '@/components/layout/DetailPageLayout';
import { PageHero } from '@/components/layout/PageHero';

const paragraphs = (html: string) => html.match(/<p\b/g)?.length ?? 0;

describe('layout blocks given only what they require', () => {
  it('shows a page hero with no description as its title alone', () => {
    const withDescription = renderToStaticMarkup(<PageHero description="Every checklist in one place" title="Templates" />);
    const withoutDescription = renderToStaticMarkup(<PageHero title="Templates" />);

    expect(withDescription).toContain('Every checklist in one place');
    expect(paragraphs(withDescription)).toBe(1);
    expect(withoutDescription).toContain('Templates</h1>');
    expect(paragraphs(withoutDescription)).toBe(0);
  });

  it('shows a call to action with no description as its title and actions alone', () => {
    const html = renderToStaticMarkup(<CtaBanner actions={<a href="/register/">Sign up</a>} title="Start free" />);

    expect(html).toContain('Start free</h2>');
    expect(html).toContain('Sign up</a>');
    expect(paragraphs(html)).toBe(0);
  });

  it('leaves out the icon tile of a detail page given neither media nor an icon', () => {
    const withIcon = renderToStaticMarkup(<DetailPageLayout icon={<svg />} title="Launch checklist" />);
    const withoutIcon = renderToStaticMarkup(<DetailPageLayout title="Launch checklist" />);

    expect(withIcon).toContain('data-slot="icon-tile"');
    expect(withoutIcon).toContain('Launch checklist</h1>');
    expect(withoutIcon).not.toContain('data-slot="icon-tile"');
  });

  it('leaves out the icon of an empty state given none', () => {
    const html = renderToStaticMarkup(<DashboardEmptyState description="Runs you start appear here." title="No runs yet" />);

    expect(html).toContain('No runs yet</h2>');
    expect(html).toContain('Runs you start appear here.');
    expect(html).not.toContain('data-slot="empty-icon"');
  });
});
