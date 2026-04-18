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
  it('renders the v0-style public template detail surface', () => {
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

    expect(html).toContain('What&#x27;s included');
    expect(html).toContain('Ready to use this template?');
    expect(html).toContain('Start Run');
    expect(html).toContain('Save');
    expect(html).toContain('Share');
    expect(html).toContain('Sections');
    expect(html).toContain('Minutes Est.');
    expect(html).not.toContain('On this page');
    expect(html).not.toContain('Template details');
  });
});
