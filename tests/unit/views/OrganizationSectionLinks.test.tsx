import { renderInTheSignedInLayoutAt } from '../../support/signedInConsoleLayout';
import { appShell } from '../../support/appShellInPlace';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import ArchivePage from '@/app/(app)/dashboard/organization/[organizationId]/archive/page';
import ImportTemplatesPage from '@/app/(app)/dashboard/organization/[organizationId]/import-templates/page';
import { organizationConsole } from '@/lib/consoleRoutes';

import { inThePersonalWorkspace, PERSONAL_WORKSPACE } from '../../fixtures/workspaces';
import { capturedGroup } from '../../support/elements';

const acme = { id: 'team-1', memberId: 'member-1', name: 'Acme', role: 'owner', teamId: 'team-1', type: 'team' } as const;

appShell.templates = {
  allTemplates: [],
  importTemplates: vi.fn(),
  refetchTemplates: vi.fn(),
  templates: [],
  templatesError: null,
  templatesLoading: false,
};
appShell.workspace = inThePersonalWorkspace({
  activeTeamId: acme.teamId,
  activeWorkspace: acme,
  canEditTemplates: true,
  consoleContext: organizationConsole(acme.teamId),
  getPermissions: () => ({ canRun: true, canEditTemplates: true, canManage: true }),
  isTeamWorkspace: true,
  routeOrganizationStatus: 'confirmed',
  workspaceScopeId: acme.teamId,
  workspaces: [PERSONAL_WORKSPACE, acme],
});

const consoleHrefs = (html: string) =>
  [...html.matchAll(/href="(\/dashboard\/[^"]*)"/g)].map((match) => capturedGroup(match, 1));

describe("an Organization's Archive and Import Templates, which have no links of their own", () => {
  it.each([
    ['archive', <ArchivePage key="archive" />],
    ['import-templates', <ImportTemplatesPage key="import-templates" />],
  ])('link nothing outside the Organization on its %s page', (section, page) => {
    const html = renderInTheSignedInLayoutAt(`/dashboard/organization/team-1/${section}/`, page);
    const hrefs = consoleHrefs(html);

    expect(hrefs).toContain(`/dashboard/organization/team-1/${section}/`);
    expect(hrefs.filter((href) => !href.startsWith('/dashboard/organization/team-1/'))).toEqual([]);
  });
});
