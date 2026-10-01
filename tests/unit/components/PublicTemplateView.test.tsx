import '../../support/mockedNextNavigation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PublicTemplateView } from '@/components/template/PublicTemplateView';
import type { ChecklistTemplate } from '@/types/checklist';
import { navigation } from '../../support/nextNavigation';

type ViewProps = React.ComponentProps<typeof PublicTemplateView>;

const renderView = (overrides: Partial<ViewProps> = {}) => {
  navigation.reset('/');
  return renderToStaticMarkup(
    <PublicTemplateView
      template={template}
      totalItems={1}
      ownerSlug="devinschumacher"
      ownerPath="/profile/devinschumacher/"
      isAuthenticated
      canSaveTemplate
      canStartRun
      isBillingError={false}
      isBillingLoading={false}
      isProUser={false}
      isCreatingRun={false}
      isSaving={false}
      isTeamWorkspace={false}
      isWorkspaceLoading={false}
      workspaceError={null}
      onStartRun={() => undefined}
      onSaveTemplate={async () => false}
      {...overrides}
    />,
  );
};

const buttonsLabelled = (html: string, label: RegExp): string[] =>
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

describe(`PublicTemplateView "Updated <date>" under the description, like the private template page's "Last updated"`, () => {
  it('says when the Template was last updated', () => {
    const updatedAtMiddayUtc = '2026-09-02T12:00:00.000Z';
    const html = renderView({
      template: { ...template, createdAt: '2026-01-05T12:00:00.000Z', updatedAt: updatedAtMiddayUtc },
    });

    expect(html).toContain(`<p>Updated <time dateTime="${updatedAtMiddayUtc}">9/2/2026</time></p>`);
  });

  it('reads a database timestamp and falls back to the created date', () => {
    const html = renderView({ template: { ...template, createdAt: '2026-01-05 12:00:00', updatedAt: '' } });

    expect(html).toContain('Updated <time dateTime="2026-01-05T12:00:00.000Z">1/5/2026</time>');
  });

  it('shows no date it cannot read', () => {
    const html = renderView({ template: { ...template, createdAt: '', updatedAt: 'not a date' } });

    expect(html).not.toContain('Updated');
    expect(html).not.toContain('Invalid Date');
  });
});

describe('PublicTemplateView', () => {
  it('renders the v0-style public template detail surface', () => {
    navigation.reset('/');
    const html = renderToStaticMarkup(
      <PublicTemplateView
        template={template}
        totalItems={1}
        ownerSlug="devinschumacher"
        ownerPath="/profile/devinschumacher/"
        isAuthenticated={false}
        canSaveTemplate
        canStartRun
        isBillingError={false}
        isBillingLoading={false}
        isProUser={false}
        isCreatingRun={false}
        isSaving={false}
        isTeamWorkspace={false}
        isWorkspaceLoading={false}
        workspaceError={null}
        onStartRun={() => undefined}
        onSaveTemplate={async () => false}
      />,
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

  it('shows template and task descriptions exactly as saved, line breaks and backslashes alike', () => {
    navigation.reset('/');
    const html = renderToStaticMarkup(
      <PublicTemplateView
        template={{
          ...template,
          description:
            'Template description line one\nSave exports to C:\\new_folder\nTemplate description line three',
          sections: [
            {
              id: 'section-1',
              title: 'Early Planning',
              items: [
                {
                  id: 'item-1',
                  title: 'Set the budget and guest count',
                  description: 'Run printf(hi\\n) and save to C:\\new_folder',
                  contents: [],
                },
              ],
            },
          ],
        }}
        totalItems={1}
        ownerSlug="devinschumacher"
        ownerPath="/profile/devinschumacher/"
        isAuthenticated={false}
        canSaveTemplate
        canStartRun
        isBillingError={false}
        isBillingLoading={false}
        isProUser={false}
        isCreatingRun={false}
        isSaving={false}
        isTeamWorkspace={false}
        isWorkspaceLoading={false}
        workspaceError={null}
        onStartRun={() => undefined}
        onSaveTemplate={async () => false}
      />,
    );

    expect(html).toContain('whitespace-pre-line');
    expect(html).toContain(
      'Template description line one\nSave exports to C:\\new_folder\nTemplate description line three',
    );
    expect(html).toContain('Run printf(hi\\n) and save to C:\\new_folder');
  });

  it('links each category to its page and leaves one with no letters or digits unlinked', () => {
    navigation.reset('/');
    const html = renderToStaticMarkup(
      <PublicTemplateView
        template={{ ...template, categories: ['日本語', '🚀'] }}
        totalItems={1}
        ownerSlug="devinschumacher"
        ownerPath="/profile/devinschumacher/"
        isAuthenticated={false}
        canSaveTemplate={false}
        canStartRun={false}
        isBillingError={false}
        isBillingLoading={false}
        isProUser={false}
        isCreatingRun={false}
        isSaving={false}
        isTeamWorkspace={false}
        isWorkspaceLoading={false}
        workspaceError={null}
        onStartRun={() => undefined}
        onSaveTemplate={async () => false}
      />,
    );

    expect(html).toContain('href="/categories/%E6%97%A5%E6%9C%AC%E8%AA%9E/"');
    expect(html).toMatch(/<span[^>]*>🚀<\/span>/);
    expect(html).not.toContain('href="/categories/%F0');
  });

  it('disables every Start Run button while a run is being created, as the Start a Run dialog says Starting…', () => {
    const buttons = buttonsLabelled(renderView({ isCreatingRun: true }), /^Start Run$/);

    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toMatch(/<button[^>]*disabled=""/);
    }
  });

  it('keeps every Start Run button enabled when no run is being created', () => {
    const buttons = buttonsLabelled(renderView(), /^Start Run$/);

    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).not.toMatch(/<button[^>]*disabled=""/);
    }
  });

  it('disables Save and Copy to Library while a signed-in plan is loading', () => {
    const buttons = buttonsLabelled(
      renderView({ isAuthenticated: true, isBillingLoading: true }),
      /^(Save|Checking plan\.\.\.)$/,
    );

    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toMatch(/<button[^>]*disabled=""/);
    }
  });

  it('lets signed-out visitors click Save so they can sign in', () => {
    const buttons = buttonsLabelled(
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

  it('tells a signed-in Free user in Personal that Save and Copy lead to an upgrade, since copying into Personal is a Pro feature', () => {
    const html = renderView({ isAuthenticated: true, isProUser: false, isTeamWorkspace: false });

    expect(buttonsLabelled(html, /^Upgrade to save$/)).toHaveLength(1);
    expect(buttonsLabelled(html, /^Upgrade to copy template$/)).toHaveLength(1);
    expect(buttonsLabelled(html, /^(Save|Copy to Library)$/)).toHaveLength(0);
  });

  it('shows plain Save and Copy to Library to a Pro user', () => {
    const html = renderView({ isAuthenticated: true, isProUser: true, isTeamWorkspace: false });
    const buttons = buttonsLabelled(html, /^(Save|Copy to Library)$/);

    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).not.toMatch(/<button[^>]*disabled=""/);
    }
    expect(html).not.toContain('Upgrade to');
  });

  it('never asks for an upgrade in an Organization, where the API checks the limit', () => {
    const html = renderView({ isAuthenticated: true, isProUser: false, isTeamWorkspace: true });

    expect(html).not.toContain('Upgrade to');
    expect(buttonsLabelled(html, /^(Save|Copy to Library)$/)).toHaveLength(2);
  });

  it('never asks a signed-out visitor to upgrade', () => {
    const html = renderView({ isAuthenticated: false, isProUser: false });

    expect(html).not.toContain('Upgrade to');
  });

  it('shows progress on both buttons while saving', () => {
    const html = renderView({ isAuthenticated: true, isProUser: true, isSaving: true });

    for (const label of [/^Saving\.\.\.$/, /^Copying\.\.\.$/]) {
      const [button] = buttonsLabelled(html, label);
      expect(button).toMatch(/<button[^>]*disabled=""/);
    }
  });

  it('offers no Save or Copy to Library to an Organization role that cannot add Templates, which the API would refuse', () => {
    const html = renderView({ canSaveTemplate: false, isTeamWorkspace: true });

    expect(buttonsLabelled(html, /^(Save|Saved|Copy to Library|Saving\.\.\.|Copying\.\.\.)$/)).toHaveLength(0);
    expect(buttonsLabelled(html, /^Start Run$/)).toHaveLength(2);
    expect(html).toContain('Your role in this Organization cannot add Templates.');
  });

  it('offers no Start Run to a role that cannot start runs', () => {
    const html = renderView({ canSaveTemplate: false, canStartRun: false, isTeamWorkspace: true });

    expect(buttonsLabelled(html, /^(Start Run|Starting\.\.\.)$/)).toHaveLength(0);
    expect(buttonsLabelled(html, /^(Save|Copy to Library)$/)).toHaveLength(0);
    expect(html).toContain('Your role in this Organization can view Templates only');
    expect(html).not.toContain('save it to your library');
  });

  describe('when the Organizations failed to load, leaving a stored Organization unconfirmed', () => {
    const workspaceError = { onContinueInPersonal: () => undefined, onRetry: () => undefined };

    it('explains the disabled actions itself, since the public shell has no WorkspaceGate or switcher, and offers Retry and Continue in Personal', () => {
      const html = renderView({ isWorkspaceLoading: true, workspaceError });

      expect(html).toContain('role="alert"');
      expect(html).toContain('Couldn&#x27;t load your Organizations');
      expect(buttonsLabelled(html, /^Retry$/)).toHaveLength(1);
      expect(buttonsLabelled(html, /^Continue in Personal$/)).toHaveLength(1);
      const actions = buttonsLabelled(html, /^(Start Run|Save|Copy to Library)$/);
      expect(actions).toHaveLength(4);
      for (const button of actions) {
        expect(button).toMatch(/<button[^>]*disabled=""/);
        expect(button).toMatch(/<button[^>]*aria-describedby="public-template-workspace-error"/);
      }
    });

    it('shows no notice while the Organizations are still loading or have loaded', () => {
      for (const isWorkspaceLoading of [true, false]) {
        const html = renderView({ isWorkspaceLoading, workspaceError: null });

        expect(html).not.toContain('Couldn&#x27;t load your Organizations');
        expect(html).not.toContain('aria-describedby="public-template-workspace-error"');
      }
    });

    it("never labels Save as an upgrade until the active context is known, since the plan loaded is Personal's", () => {
      const html = renderView({ isProUser: false, isWorkspaceLoading: true, workspaceError });

      expect(html).not.toContain('Upgrade to');
    });
  });
});
