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
        canSaveTemplate
        canStartRun
        isBillingLoading={false}
        isProUser={false}
        isCreatingRun={false}
        isSaving={false}
        isTeamWorkspace={false}
        isWorkspaceLoading={false}
        onStartRun={() => undefined}
        onSaveTemplate={async () => false}
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
          canSaveTemplate
          canStartRun
          isBillingLoading={false}
          isProUser={false}
          isCreatingRun={false}
          isSaving={false}
          isTeamWorkspace={false}
          isWorkspaceLoading={false}
          onStartRun={() => undefined}
          onSaveTemplate={async () => false}
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
          canSaveTemplate
          canStartRun
          isBillingLoading={false}
          isProUser={false}
          isCreatingRun={false}
          isSaving={false}
          isTeamWorkspace={false}
          isWorkspaceLoading={false}
          onStartRun={() => undefined}
          onSaveTemplate={async () => false}
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

  it('disables Save and Copy to Library while a signed-in plan is loading', () => {
    const buttons = findButtons(
      renderView({ isAuthenticated: true, isBillingLoading: true }),
      /^(Save|Checking plan\.\.\.)$/,
    );

    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toMatch(/<button[^>]*disabled=""/);
    }
  });

  it('lets signed-out visitors click Save so they can sign in', () => {
    const buttons = findButtons(
      renderView({ isAuthenticated: false, isBillingLoading: false }),
      /^(Save|Copy to Library)$/,
    );

    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).not.toMatch(/<button[^>]*disabled=""/);
    }
  });

  it('never shows the saved state before a save succeeds', () => {
    const html = renderView({ isSaving: true });

    expect(html).toContain('Saving...');
    expect(html).not.toContain('Saved');
  });

  // Copying into Personal is a Pro feature: a Free user's click starts checkout.
  it('tells a signed-in Free user in Personal that Save and Copy lead to an upgrade', () => {
    const html = renderView({ isAuthenticated: true, isProUser: false, isTeamWorkspace: false });

    expect(findButtons(html, /^Upgrade to save$/)).toHaveLength(1);
    expect(findButtons(html, /^Upgrade to copy template$/)).toHaveLength(1);
    expect(findButtons(html, /^(Save|Copy to Library)$/)).toHaveLength(0);
  });

  it('shows plain Save and Copy to Library to a Pro user', () => {
    const html = renderView({ isAuthenticated: true, isProUser: true, isTeamWorkspace: false });
    const buttons = findButtons(html, /^(Save|Copy to Library)$/);

    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).not.toMatch(/<button[^>]*disabled=""/);
    }
    expect(html).not.toContain('Upgrade to');
  });

  it('never asks for an upgrade in an Organization, where the API checks the limit', () => {
    const html = renderView({ isAuthenticated: true, isProUser: false, isTeamWorkspace: true });

    expect(html).not.toContain('Upgrade to');
    expect(findButtons(html, /^(Save|Copy to Library)$/)).toHaveLength(2);
  });

  it('never asks a signed-out visitor to upgrade', () => {
    const html = renderView({ isAuthenticated: false, isProUser: false });

    expect(html).not.toContain('Upgrade to');
  });

  it('shows progress on both buttons while saving', () => {
    const html = renderView({ isAuthenticated: true, isProUser: true, isSaving: true });

    for (const label of [/^Saving\.\.\.$/, /^Copying\.\.\.$/]) {
      const [button] = findButtons(html, label);
      expect(button).toMatch(/<button[^>]*disabled=""/);
    }
  });

  // In an Organization the viewer's role decides: the API refuses the rest with a 403.
  it('offers no Save or Copy to Library to a role that cannot add Templates', () => {
    const html = renderView({ canSaveTemplate: false, isTeamWorkspace: true });

    expect(findButtons(html, /^(Save|Saved|Copy to Library|Saving\.\.\.|Copying\.\.\.)$/)).toHaveLength(0);
    expect(findButtons(html, /^Start Run$/)).toHaveLength(2);
    expect(html).toContain('Your role in this Organization cannot add Templates.');
  });

  it('offers no Start Run to a role that cannot start runs', () => {
    const html = renderView({ canSaveTemplate: false, canStartRun: false, isTeamWorkspace: true });

    expect(findButtons(html, /^(Start Run|Starting\.\.\.)$/)).toHaveLength(0);
    expect(findButtons(html, /^(Save|Copy to Library)$/)).toHaveLength(0);
    expect(html).toContain('Your role in this Organization can view Templates only');
    expect(html).not.toContain('save it to your library');
  });
});
