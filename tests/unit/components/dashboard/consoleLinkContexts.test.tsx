import { navigation } from '../../../support/mockedNextNavigation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { RunListItem } from '@/components/dashboard/RunListItem';
import { TemplateCard } from '@/components/dashboard/TemplateCard';
import { TemplateListItem } from '@/components/dashboard/TemplateListItem';
import { getRunRowActions } from '@/features/dashboard-runs/runRowActions';
import { organizationConsole, PERSONAL_CONSOLE, type ConsoleContext } from '@/lib/consoleRoutes';
import { PERSONAL_PERMISSIONS } from '@/lib/organizationPermissions';
import type { ChecklistRun, ChecklistTemplate } from '@/types/checklist';
import { PRIVATE_LAUNCH_TEMPLATE } from '../../../fixtures/dashboardTemplate';
import { capturedGroup } from '../../../support/elements';

const acme = organizationConsole('team-1');

const hrefsOf = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => capturedGroup(match, 1));

const renderBoth = (template: ChecklistTemplate, context: ConsoleContext) => {
  navigation.reset('/dashboard/templates/');
  return {
    card: hrefsOf(renderToStaticMarkup(<TemplateCard context={context} template={template} />)),
    row: hrefsOf(renderToStaticMarkup(<TemplateListItem context={context} onStartRun={vi.fn()} template={template} />)),
  };
};

const run = (overrides: Partial<ChecklistRun>): ChecklistRun => ({
  id: 'run-1',
  templateId: 'template-1',
  title: 'Launch week',
  status: 'in_progress',
  progress: 0,
  sections: [],
  startedAt: '2026-09-01T00:00:00.000Z',
  userId: 'user-1',
  ...overrides,
});

const renderRunRow = (shownRun: ChecklistRun, template: ChecklistTemplate) => {
  navigation.reset('/dashboard/runs/');
  return hrefsOf(
    renderToStaticMarkup(
      <RunListItem
        actions={getRunRowActions(shownRun, PERSONAL_PERMISSIONS)}
        isRevalidating={false}
        isStoppingShare={false}
        onDelete={vi.fn()}
        onShare={vi.fn()}
        run={shownRun}
        template={template}
      />,
    ),
  );
};

describe('Template cards and rows link in the context of the list that shows them', () => {
  it('open a Personal Template and its editor in Personal', () => {
    const { card, row } = renderBoth(PRIVATE_LAUNCH_TEMPLATE, PERSONAL_CONSOLE);

    expect(card).toContain('/dashboard/templates/template-1/');
    expect(row).toEqual(['/dashboard/templates/template-1/', '/dashboard/templates/template-1/edit/']);
  });

  it("open an Organization's Templates and their editor inside that Organization", () => {
    const { card, row } = renderBoth({ ...PRIVATE_LAUNCH_TEMPLATE, isPublic: true, teamId: 'team-1' }, acme);

    expect(card).toContain('/dashboard/organization/team-1/templates/template-1/');
    expect(row).toEqual([
      '/dashboard/organization/team-1/templates/template-1/',
      '/dashboard/organization/team-1/templates/template-1/edit/',
    ]);
  });

  it('open a private Organization Template in its own Organization even when another context is shown', () => {
    const pinned = { ...PRIVATE_LAUNCH_TEMPLATE, teamId: 'team-2' };

    for (const context of [PERSONAL_CONSOLE, acme]) {
      const { card, row } = renderBoth(pinned, context);
      expect(card).toContain('/dashboard/organization/team-2/templates/template-1/');
      expect(row).toEqual([
        '/dashboard/organization/team-2/templates/template-1/',
        '/dashboard/organization/team-2/templates/template-1/edit/',
      ]);
    }
  });
});

describe('Run rows link in the context of the run', () => {
  it('open a Personal run, and the Template it came from, in Personal', () => {
    expect(renderRunRow(run({}), PRIVATE_LAUNCH_TEMPLATE)).toEqual([
      '/dashboard/runs/run-1/',
      '/dashboard/templates/template-1/',
      '/dashboard/runs/run-1/',
    ]);
  });

  it("open an Organization's run, and the public Template it came from, in that Organization", () => {
    const hrefs = renderRunRow(run({ teamId: 'team-1' }), { ...PRIVATE_LAUNCH_TEMPLATE, isPublic: true });

    expect(hrefs).toEqual([
      '/dashboard/organization/team-1/runs/run-1/',
      '/dashboard/organization/team-1/templates/template-1/',
      '/dashboard/organization/team-1/runs/run-1/',
    ]);
  });

  it("open a private Organization Template in its own Organization from another Organization's run", () => {
    const hrefs = renderRunRow(run({ teamId: 'team-1' }), { ...PRIVATE_LAUNCH_TEMPLATE, teamId: 'team-2' });

    expect(hrefs).toContain('/dashboard/organization/team-2/templates/template-1/');
    expect(hrefs).toContain('/dashboard/organization/team-1/runs/run-1/');
  });
});
