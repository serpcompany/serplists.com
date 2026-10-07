import { navigation } from '../../../tests/support/mockedNextNavigation';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TemplateCard } from '@/components/checklist-library/TemplateCard';
import type { ChecklistTemplate } from '@/types/checklist';

const template = {
  id: 'website-launch',
  title: 'Website Launch Checklist',
  description: 'A comprehensive checklist for launching a new website.',
  isPublic: true,
  sections: [
    { id: 's-1', title: 'Pre-launch', items: [{ id: 'i-1', title: 'Task' }] },
    { id: 's-2', title: 'Launch', items: [{ id: 'i-2', title: 'Task' }, { id: 'i-3', title: 'Task' }] },
  ],
  userId: 'user-1',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
  categories: ['Launch', 'Marketing'],
  ownerProfile: { full_name: 'Design Ops', username: 'designops' },
  viewCount: 1250,
} satisfies ChecklistTemplate & { viewCount: number };

describe('TemplateCard', () => {
  it('renders the card metadata, direct links, passive category pills, and creator fallback', () => {
    navigation.reset('/');
    const markup = renderToStaticMarkup(<TemplateCard template={template} />);

    expect(markup).toContain('Website Launch Checklist');
    expect(markup).toContain('A comprehensive checklist for launching a new website.');
    expect(markup).toContain('2 sections');
    expect(markup).toContain('3 tasks');
    expect(markup).toContain('1,250 views');
    expect(markup).toContain('designops');
    expect(markup).toContain('Start');
    expect(markup).toContain('View Template');
    expect(markup).toMatch(
      /<h3[^>]*><a href="\/profile\/designops\/website-launch-checklist\/"[^>]*data-slot="media-card-link"/,
    );
    expect(markup).toContain('href="/profile/designops/"');
    expect(markup).not.toContain('href="/dashboard/runs/');
    expect(markup).not.toContain('href="/categories/');
    const pills = [...markup.matchAll(/<span[^>]*data-slot="badge"[^>]*>([^<]*)</g)].map((match) => match[1]);
    expect(pills).toEqual(['Launch', 'Marketing']);
    expect(markup).toContain('>D</span>');
  });

  it("names an Organization Template's Organization and links the card and its owner to the Organization's URL, never its Creator's", () => {
    navigation.reset('/');
    const markup = renderToStaticMarkup(
      <TemplateCard
        template={{
          ...template,
          ownerType: 'team',
          owner: { type: 'team', publicHandle: 'Acme-Launch', displayName: 'Acme Launch' },
        }}
      />,
    );

    expect(markup).toMatch(/<h3[^>]*><a href="\/profile\/Acme-Launch\/website-launch-checklist\/"/);
    expect(markup).toContain('href="/profile/Acme-Launch/"');
    expect(markup).toContain('>A</span>');
    expect(markup).not.toContain('designops');
  });

  it('keeps the hover shortcut out of the tab order and away from assistive technology', () => {
    navigation.reset('/');
    const markup = renderToStaticMarkup(<TemplateCard template={template} />);

    expect(markup).toMatch(/<div aria-hidden="true"[^>]*><a [^>]*tabindex="-1"[^>]*>(?:(?!<\/a>).)*View Template<\/a>/);
  });

  it('never links a template without a public URL back to the library', () => {
    navigation.reset('/categories/launch/');
    const markup = renderToStaticMarkup(
      <TemplateCard
        template={{ ...template, ownerProfile: { full_name: 'No Handle' } }}
      />,
    );

    expect(markup).toContain('Website Launch Checklist');
    expect(markup).not.toContain('href="/templates');
    const hrefs = [...markup.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
    hrefs.forEach((href) => expect(href).toMatch(/^\/profile\/[^/]+(\/[^/]+)?\/$/));
  });
});
