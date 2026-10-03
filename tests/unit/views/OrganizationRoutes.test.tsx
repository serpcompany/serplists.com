import { renderInTheSignedInLayoutAt } from '../../support/signedInConsoleLayout';
import { appShell } from '../../support/appShellInPlace';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import ArchivePage from '@/app/(app)/dashboard/archive/page';
import ImportTemplatesPage from '@/app/(app)/dashboard/import-templates/page';
import RunPage from '@/app/(app)/dashboard/runs/[id]/page';
import RunsPage from '@/app/(app)/dashboard/runs/page';
import SettingsPage from '@/app/(app)/dashboard/settings/page';
import TemplateEditPage from '@/app/(app)/dashboard/templates/[id]/edit/page';
import TemplatePage from '@/app/(app)/dashboard/templates/[id]/page';
import TemplateCreatePage from '@/app/(app)/dashboard/templates/new/page';
import TemplatesPage from '@/app/(app)/dashboard/templates/page';
import OrganizationArchivePage from '@/app/(app)/dashboard/organization/[organizationId]/archive/page';
import OrganizationImportTemplatesPage from '@/app/(app)/dashboard/organization/[organizationId]/import-templates/page';
import OrganizationLayout from '@/app/(app)/dashboard/organization/[organizationId]/layout';
import OrganizationRunPage from '@/app/(app)/dashboard/organization/[organizationId]/runs/[id]/page';
import OrganizationRunsPage from '@/app/(app)/dashboard/organization/[organizationId]/runs/page';
import OrganizationSettingsPage from '@/app/(app)/dashboard/organization/[organizationId]/settings/page';
import OrganizationTemplateEditPage from '@/app/(app)/dashboard/organization/[organizationId]/templates/[id]/edit/page';
import OrganizationTemplatePage from '@/app/(app)/dashboard/organization/[organizationId]/templates/[id]/page';
import OrganizationTemplateCreatePage from '@/app/(app)/dashboard/organization/[organizationId]/templates/new/page';
import OrganizationTemplatesPage from '@/app/(app)/dashboard/organization/[organizationId]/templates/page';
import { organizationConsole, parseConsoleRoute } from '@/lib/consoleRoutes';
import type { RouteOrganizationStatus } from '@/contexts/workspaceSelection';

const ACME = {
  id: 'team-1',
  memberId: 'member-1',
  name: 'Acme',
  role: 'owner',
  teamId: 'team-1',
  type: 'team',
} as const;

appShell.templates = { templates: [], runs: [] };

const inAcme = (routeOrganizationStatus: RouteOrganizationStatus) => ({
  activeTeamId: routeOrganizationStatus === 'confirmed' ? ACME.id : undefined,
  activeWorkspace: ACME,
  canEditTemplates: true,
  consoleContext: organizationConsole(ACME.id),
  getPermissions: () => ({ canRun: true, canEditTemplates: true, canManage: true }),
  isWorkspaceLoading: routeOrganizationStatus !== 'confirmed',
  routeOrganizationStatus,
  selectWorkspace: vi.fn(),
  workspaces: [ACME],
  workspaceScopeId: ACME.id,
  workspaceStatus: routeOrganizationStatus === 'confirmed' ? 'ready' : 'loading',
});

const ARCHIVE_PATH = '/dashboard/organization/team-1/archive/';

const renderTheOrganizationArchive = (routeOrganizationStatus: RouteOrganizationStatus): string => {
  appShell.workspace = inAcme(routeOrganizationStatus);
  return renderInTheSignedInLayoutAt(
    ARCHIVE_PATH,
    <OrganizationLayout>
      <OrganizationArchivePage />
    </OrganizationLayout>,
  );
};

describe('the Organization console routes', () => {
  it("render the same pages as the Personal routes, under the Organization's layout", () => {
    expect([
      OrganizationTemplatesPage,
      OrganizationTemplateCreatePage,
      OrganizationTemplatePage,
      OrganizationTemplateEditPage,
      OrganizationImportTemplatesPage,
      OrganizationRunsPage,
      OrganizationRunPage,
      OrganizationSettingsPage,
      OrganizationArchivePage,
    ]).toEqual([
      TemplatesPage,
      TemplateCreatePage,
      TemplatePage,
      TemplateEditPage,
      ImportTemplatesPage,
      RunsPage,
      RunPage,
      SettingsPage,
      ArchivePage,
    ]);
  });

  it.each([
    '/dashboard/organization/team-1/templates/',
    '/dashboard/organization/team-1/templates/new/',
    '/dashboard/organization/team-1/templates/tpl-1/',
    '/dashboard/organization/team-1/templates/tpl-1/edit/',
    '/dashboard/organization/team-1/import-templates/',
    '/dashboard/organization/team-1/runs/',
    '/dashboard/organization/team-1/runs/run-1/',
    '/dashboard/organization/team-1/settings/',
    ARCHIVE_PATH,
  ])('read %s as a page of that Organization', (path) => {
    expect(parseConsoleRoute(path)?.context).toEqual(organizationConsole('team-1'));
  });

  it("show the page once the user's Organizations confirm it, with the sidebar staying in the Organization", () => {
    const html = renderTheOrganizationArchive('confirmed');

    expect(html).toContain('data-archive-recovery-section="true"');
    expect(html).toContain('data-app-shell="console"');
    expect(html).not.toContain('That page does not exist');
    for (const section of ['templates/', 'templates/new/', 'runs/', 'import-templates/', 'settings/']) {
      expect(html).toContain(`href="/dashboard/organization/team-1/${section}"`);
    }
    expect(html).toMatch(/<a[^>]*href="\/dashboard\/organization\/team-1\/archive\/"[^>]*aria-current="page"/);
    expect(html).not.toContain('href="/dashboard/templates/"');
  });

  it('show a loading state, and none of the page, until the Organizations load', () => {
    const html = renderTheOrganizationArchive('pending');

    expect(html).toContain('data-organization-route-pending="true"');
    expect(html).not.toContain('data-archive-recovery-section');
    expect(html).not.toContain('That page does not exist');
  });

  it('show the not-found page, and none of the page, for an Organization the user cannot open', () => {
    const html = renderTheOrganizationArchive('missing');

    expect(html).toContain('That page does not exist');
    expect(html).toContain('data-app-shell="console"');
    expect(html).not.toContain('data-archive-recovery-section');
    expect(html).not.toContain('Archived templates');
  });
});
