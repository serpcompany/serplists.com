import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TemplateCard } from '@/components/checklist-library/TemplateCard';
import type { ChecklistTemplate } from '@/types/checklist';
import { navigation } from '../../../tests/support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../../tests/support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../../tests/support/nextNavigation')).nextLinkMock);

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
  it('renders the v0 preview card metadata, direct links, passive category pills, and creator fallback', () => {
    navigation.reset('/');
    const markup = renderToStaticMarkup(<TemplateCard template={template} />);

    expect(markup).toContain('Launch');
    expect(markup).toContain('Marketing');
    expect(markup).toContain('Website Launch Checklist');
    expect(markup).toContain('A comprehensive checklist for launching a new website.');
    expect(markup).toContain('2 sections');
    expect(markup).toContain('3 tasks');
    expect(markup).toContain('1,250 views');
    expect(markup).toContain('designops');
    expect(markup).toContain('Start');
    expect(markup).toContain('View Template');
    expect(markup).toContain('href="/profile/designops/website-launch-checklist"');
    expect(markup).toContain('href="/profile/designops"');
    expect(markup).not.toContain('href="/run/website-launch"');
    expect(markup).not.toContain('href="/categories/');
    expect(markup).toContain('<span class="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Launch</span>');
    expect(markup).toContain('<span class="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Marketing</span>');
    expect(markup).toContain('>D</span>');
  });

  it('never links a template without a public URL back to the library', () => {
    navigation.reset('/categories/launch');
    const markup = renderToStaticMarkup(
      <TemplateCard
        template={{ ...template, ownerProfile: { full_name: 'No Handle' } }}
      />,
    );

    expect(markup).toContain('Website Launch Checklist');
    expect(markup).not.toContain('href="/templates"');
    const hrefs = [...markup.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
    hrefs.forEach((href) => expect(href).toMatch(/^\/profile\/[^/]+(\/[^/]+)?$/));
  });
});
