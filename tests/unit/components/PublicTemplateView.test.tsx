import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { PublicTemplateView } from '@/components/template/PublicTemplateView';
import type { ChecklistTemplate } from '@/types/checklist';

const template: ChecklistTemplate = {
  id: 'template-1',
  slug: 'complete-wedding-planning-checklist',
  title: 'Complete Wedding Planning Checklist',
  description:
    'A wedding planning checklist organized around budget, venue, and guest milestones.',
  sections: [
    {
      id: 'section-1',
      title: 'Early Planning',
      items: [
        {
          id: 'item-1',
          title: 'Set the budget and guest count',
          description: '',
          contents: [],
        },
      ],
    },
  ],
  categories: ['wedding', 'events', 'planning'],
  tags: [],
  type: 'checklist',
  userId: 'user-1',
  isPublic: true,
  version: 1,
  createdAt: '2026-03-24T00:00:00.000Z',
  updatedAt: '2026-03-24T00:00:00.000Z',
};

describe('PublicTemplateView', () => {
  it('renders a repo-style layout without the old stacked callout cards', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PublicTemplateView
          template={template}
          totalItems={1}
          ownerSlug="devinschumacher"
          ownerPath="/profile/devinschumacher"
          isAuthenticated={false}
          isBillingLoading={false}
          isProUser={false}
          isCreatingRun={false}
          isSaving={false}
          onStartRun={() => undefined}
          onSaveTemplate={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(html).toContain('Checklist preview');
    expect(html).toContain('On this page');
    expect(html).toContain('Template details');
    expect(html).toContain('Start checklist');
    expect(html).toContain('Log in to copy template');
    expect(html).toContain('text-3xl');
    expect(html).toContain('text-base');
    expect(html).not.toContain('Action rail');
    expect(html).not.toContain('At a glance');
    expect(html).not.toContain('Template walkthrough');
    expect(html).not.toContain('sm:text-5xl');
  });
});
