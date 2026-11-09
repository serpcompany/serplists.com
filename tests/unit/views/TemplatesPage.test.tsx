import { navigation } from '../../support/mockedNextNavigation';
import {
  dashboardTemplates,
  NO_TEMPLATES,
  showTheTemplatesModel,
  websiteLaunchTemplate as template,
} from '../../support/mockedDashboardTemplatesModel';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { firstOf } from '../../support/elements';

import { organizationConsole } from '@/lib/consoleRoutes';
import Templates from '@/views/Templates';
import { handlerIn } from '../../support/elementTree';

const runDialog = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock('@/components/ui/run-name-dialog', () => ({
  RunNameDialog: (props: Record<string, unknown>) => {
    runDialog.props = props;
    return null;
  },
}));

const renderTemplatesAt = (path: string) => {
  navigation.reset(path);
  return renderToStaticMarkup(<Templates />);
};

describe('Templates page', () => {
  it('renders the exact dashboard-templates lane instead of the local beta workspace copy', () => {
    showTheTemplatesModel({ selectedTemplate: template(), selectedTemplateId: 'template-1' });

    const html = renderTemplatesAt('/');

    expect(html).toContain('My Templates');
    expect(html).toContain('data-dashboard-content-shell="true"');
    expect(html).toContain('data-dashboard-page-header="true"');
    expect(html).toContain('1 template in your library');
    expect(html).toContain('Search templates...');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('Start Run');
    expect(html).not.toContain('Portable import and export');
    expect(html).not.toContain('Template JSON Import');
    expect(html).not.toContain('Beta workspace lane');
    expect(html).not.toContain('Owned templates');
  });

  it("links its Templates inside the Organization the page shows, in the grid and in the list", () => {
    for (const viewMode of ['grid', 'list'] as const) {
      dashboardTemplates.viewMode = viewMode;
      showTheTemplatesModel({ consoleContext: organizationConsole('team-1'), templates: [template({ teamId: 'team-1' })] });

      const html = renderTemplatesAt('/dashboard/organization/team-1/templates/');

      expect(html, viewMode).toContain('href="/dashboard/organization/team-1/templates/template-1/"');
      expect(html, viewMode).not.toContain('href="/dashboard/templates/template-1/');
    }
    dashboardTemplates.viewMode = 'grid';
  });

  it('renders the reference empty state instead of the generic local fallback copy', () => {
    showTheTemplatesModel(NO_TEMPLATES);

    const html = renderTemplatesAt('/');

    expect(html).toContain('No templates found');
    expect(html).toContain('Create Template');
    expect(html).not.toContain('No templates matched this view.');
  });

  it('shows a load error with Retry instead of the empty state when the list failed to load', () => {
    showTheTemplatesModel({ ...NO_TEMPLATES, loadError: new Error('HTTP 500') });

    const html = renderTemplatesAt('/');

    expect(html).toContain('Couldn&#x27;t load your templates');
    expect(html).toContain('Retry');
    expect(html).not.toContain('No templates found');
    expect(html).not.toContain('Create your first template');
  });

  it('orders Most Recent by last activity when some templates were never edited', () => {
    const templates = [
      template({ id: 'n1', title: 'Untouched Plan', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '' }),
      template({ id: 'a', title: 'Second Of September Edit', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z' }),
      template({ id: 'n2', title: 'Imported Recently', createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '' }),
      template({ id: 'b', title: 'Twentieth Of September Edit', createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z' }),
    ];
    showTheTemplatesModel({ templates, totalTemplateItems: 8, selectedTemplate: firstOf(templates), selectedTemplateId: 'n1' });

    const html = renderTemplatesAt('/');
    const order = ['Twentieth Of September Edit', 'Imported Recently', 'Second Of September Edit', 'Untouched Plan'].map(
      (title) => html.indexOf(title),
    );

    expect(order.every((position) => position >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((left, right) => left - right));
  });

  it.each(['grid', 'list'] as const)('offers an Organization viewer no create, run, edit or delete actions (%s view)', (viewMode) => {
    dashboardTemplates.viewMode = viewMode;
    showTheTemplatesModel({
      templates: [template({ teamId: 'team-1' })],
      canCreateRun: false,
      canCreateTemplate: false,
      canEditTemplate: false,
      canRunTemplate: false,
    });

    const html = renderTemplatesAt('/');

    expect(html).toContain('Website Launch Checklist');
    expect(html).not.toContain('New Template');
    expect(html).not.toContain('Start Run');
    expect(html).not.toContain('/edit"');
    expect(html).not.toContain('Delete');
  });

  it('hides Create Template in the empty state for members who cannot create Templates', () => {
    showTheTemplatesModel({ ...NO_TEMPLATES, canCreateTemplate: false, canEditTemplate: false });

    const html = renderTemplatesAt('/');

    expect(html).toContain('No templates found');
    expect(html).not.toContain('Create Template');
  });
});

describe('Templates page Start Run', () => {
  it('asks for the name in the Start a Run dialog the other pages use, with no template picker since the card chose the template', async () => {
    const createRunFromTemplate = vi.fn().mockResolvedValue({ kind: 'ok', runId: 'run-1' });
    showTheTemplatesModel({
      templates: [template(), template({ id: 'template-2', title: 'Vendor onboarding' })],
      totalTemplateItems: 4,
      selectedTemplate: template({ id: 'template-2', title: 'Vendor onboarding' }),
      selectedTemplateId: 'template-2',
      runLauncherOpen: true,
      createRunFromTemplate,
    });

    const html = renderTemplatesAt('/dashboard/templates/');

    expect(html).not.toContain('Select a template');
    expect(runDialog.props).toEqual(
      expect.objectContaining({ loading: false, open: true, templateTitle: 'Vendor onboarding' }),
    );
    await handlerIn(runDialog.props, 'onConfirm')('Q3 vendor onboarding');
    expect(createRunFromTemplate).toHaveBeenCalledWith('Q3 vendor onboarding');
  });
});

describe('Templates page count', () => {
  const renderWith = (overrides: Parameters<typeof showTheTemplatesModel>[0]) => {
    showTheTemplatesModel(overrides);
    return renderTemplatesAt('/dashboard/templates/');
  };

  it('counts one template in the singular and more in the plural', () => {
    expect(renderWith({ templates: [template()] })).toContain('1 template in your library');
    expect(
      renderWith({ templates: [template(), template({ id: 'template-2', title: 'Vendor onboarding' })] }),
    ).toContain('2 templates in your library');
    expect(renderWith({ templates: [], isEmpty: true })).toContain('0 templates in your library');
  });

  it('shows no count, not even 0 templates, until the list has loaded', () => {
    expect(renderWith({ templates: [], loading: true })).not.toContain('in your library');
    expect(renderWith({ templates: [], loadError: new Error('HTTP 500') })).not.toContain('in your library');
  });
});
