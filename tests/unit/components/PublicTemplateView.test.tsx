import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';

import { PublicTemplateView } from '@/components/template/PublicTemplateView';
import type { ChecklistTemplate } from '@/types/checklist';

type ViewProps = React.ComponentProps<typeof PublicTemplateView>;

const renderView = (overrides: Partial<ViewProps> = {}) =>
  renderToStaticMarkup(
    <StaticRouter location="/">
      <PublicTemplateView
        template={template}
        totalItems={1}
        ownerSlug="devinschumacher"
        ownerPath="/profile/devinschumacher"
        isAuthenticated
        isBillingLoading={false}
        isProUser={false}
        isCreatingRun={false}
        isSaving={false}
        isWorkspaceLoading={false}
        onStartRun={() => undefined}
        onSaveTemplate={() => undefined}
        {...overrides}
      />
    </StaticRouter>,
  );

// Every rendered <button> whose label matches, with its opening tag.
const findButtons = (html: string, label: RegExp): string[] =>
  (html.match(/<button[^>]*>[\s\S]*?<\/button>/g) ?? []).filter((button) =>
    label.test(button.replace(/<[^>]+>/g, '')),
  );

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
      <StaticRouter location="/">
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
          isWorkspaceLoading={false}
          onStartRun={() => undefined}
          onSaveTemplate={() => undefined}
        />
      </StaticRouter>,
    );

    expect(html).toContain('What&#x27;s included');
    expect(html).toContain('Ready to use this template?');
    expect(html).toContain('Start Run');
    expect(html).toContain('Save');
    expect(html).toContain('Share');
    expect(html).toContain('Sections');
    expect(html).toContain('Tasks');
    expect(html).toContain('Type');
    expect(html).toContain('checklist');
    expect(html).not.toContain('Minutes Est.');
    expect(html).not.toContain('On this page');
    expect(html).not.toContain('Template details');
  });

  it('preserves authored line breaks in template and task descriptions', () => {
    const html = renderToStaticMarkup(
      <StaticRouter location="/">
        <PublicTemplateView
          template={{
            ...template,
            description:
              'Template description line one\nTemplate description line two\\nTemplate description line three',
            sections: [
              {
                id: 'section-1',
                title: 'Early Planning',
                items: [
                  {
                    id: 'item-1',
                    title: 'Set the budget and guest count',
                    description: 'Task line one\nTask line two\\nTask line three',
                    contents: [],
                  },
                ],
              },
            ],
          }}
          totalItems={1}
          ownerSlug="devinschumacher"
          ownerPath="/profile/devinschumacher"
          isAuthenticated={false}
          isBillingLoading={false}
          isProUser={false}
          isCreatingRun={false}
          isSaving={false}
          isWorkspaceLoading={false}
          onStartRun={() => undefined}
          onSaveTemplate={() => undefined}
        />
      </StaticRouter>,
    );

    expect(html).toContain('whitespace-pre-line');
    expect(html).toContain(
      'Template description line one\nTemplate description line two\nTemplate description line three',
    );
    expect(html).toContain('Task line one\nTask line two\nTask line three');
  });

  it('disables every Start Run button while a run is being created', () => {
    const buttons = findButtons(
      renderView({ isCreatingRun: true }),
      /^(Start Run|Starting\.\.\.)$/,
    );

    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toContain('Starting...');
      expect(button).toMatch(/<button[^>]*disabled=""/);
    }
  });

  it('keeps every Start Run button enabled when no run is being created', () => {
    const buttons = findButtons(renderView(), /^Start Run$/);

    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).not.toMatch(/<button[^>]*disabled=""/);
    }
  });
});
