import { describe, expect, it } from 'vitest';

import {
  buildConsoleArchivePath,
  buildConsoleHomePath,
  buildConsoleRoutePath,
  buildConsoleRunPath,
  buildConsoleRunsPath,
  buildConsoleSettingsPath,
  buildConsoleTemplateCreatePath,
  buildConsoleTemplateEditPath,
  buildConsoleTemplateImportPath,
  buildConsoleTemplatePath,
  buildConsoleTemplatesPath,
  buildEquivalentConsolePath,
  getRouteOrganizationId,
  isSameConsoleContext,
  isWithinConsoleArea,
  organizationConsole,
  parseConsoleRoute,
  PERSONAL_CONSOLE,
  type ConsoleRoute,
  type ConsoleSection,
} from '@/lib/consoleRoutes';

const acme = organizationConsole('team-1');

const EVERY_SECTION: ConsoleSection[] = [
  { name: 'templates' },
  { name: 'template-create' },
  { name: 'template', templateId: 'tpl-1' },
  { name: 'template-edit', templateId: 'tpl-1' },
  { name: 'template-import' },
  { name: 'runs' },
  { name: 'run', runId: 'run-1' },
  { name: 'settings' },
  { name: 'archive' },
];

const EVERY_ROUTE: ConsoleRoute[] = [PERSONAL_CONSOLE, acme].flatMap((context) =>
  EVERY_SECTION.map((section) => ({ context, section })),
);

describe('console route builders', () => {
  it('build the same sections under the Organization, named by its stable id', () => {
    expect(buildConsoleTemplatesPath(acme)).toBe('/dashboard/organization/team-1/templates/');
    expect(buildConsoleHomePath(acme)).toBe('/dashboard/organization/team-1/templates/');
    expect(buildConsoleTemplateCreatePath(acme)).toBe('/dashboard/organization/team-1/templates/new/');
    expect(buildConsoleTemplatePath('tpl-1', acme)).toBe('/dashboard/organization/team-1/templates/tpl-1/');
    expect(buildConsoleTemplateEditPath('tpl-1', acme)).toBe('/dashboard/organization/team-1/templates/tpl-1/edit/');
    expect(buildConsoleTemplateImportPath(acme)).toBe('/dashboard/organization/team-1/import-templates/');
    expect(buildConsoleRunsPath(acme)).toBe('/dashboard/organization/team-1/runs/');
    expect(buildConsoleRunPath('run-1', acme)).toBe('/dashboard/organization/team-1/runs/run-1/');
    expect(buildConsoleSettingsPath(acme)).toBe('/dashboard/organization/team-1/settings/');
    expect(buildConsoleArchivePath(acme)).toBe('/dashboard/organization/team-1/archive/');
  });

  it('encode ids, so an id is always one path segment', () => {
    expect(buildConsoleRunPath('a/b c', organizationConsole('x/y'))).toBe('/dashboard/organization/x%2Fy/runs/a%2Fb%20c/');
  });
});

describe('parseConsoleRoute', () => {
  it.each(EVERY_ROUTE.map((route) => [buildConsoleRoutePath(route), route] as const))(
    'reads %s back as the route it was built from',
    (path, route) => {
      expect(parseConsoleRoute(path)).toEqual(route);
    },
  );

  it('reads a path without its trailing slash, with a query or a hash', () => {
    expect(parseConsoleRoute('/dashboard/organization/team-1/runs/run-1')).toEqual({
      context: acme,
      section: { name: 'run', runId: 'run-1' },
    });
    expect(parseConsoleRoute('/dashboard/settings/?billing=success#plan')).toEqual({
      context: PERSONAL_CONSOLE,
      section: { name: 'settings' },
    });
  });

  it('decodes ids that the builders encoded', () => {
    expect(parseConsoleRoute(buildConsoleTemplatePath('a/b c', organizationConsole('x/y')))).toEqual({
      context: organizationConsole('x/y'),
      section: { name: 'template', templateId: 'a/b c' },
    });
  });

  it.each([
    '/',
    '/templates/',
    '/dashboard',
    '/dashboard/',
    '/dashboard/organization/',
    '/dashboard/organization/team-1/',
    '/dashboard/organization/team-1/organization/team-2/templates/',
    '/dashboard/definitely-missing/',
    '/dashboard/templates/new/edit/',
    '/dashboard/templates/tpl-1/edit/more/',
    '/dashboard/runs/run-1/edit/',
    '/dashboard/settings/members/',
    '/dashboard//templates/',
    '/dashboard/runs/%E0%A4%A/',
    '/console/templates/tpl-1/',
    'dashboard/templates/',
  ])('finds no console page at %s', (path) => {
    expect(parseConsoleRoute(path)).toBeNull();
  });

  it('names the Organization of an Organization route only', () => {
    expect(getRouteOrganizationId('/dashboard/organization/team-1/archive/')).toBe('team-1');
    expect(getRouteOrganizationId('/dashboard/archive/')).toBeNull();
    expect(getRouteOrganizationId('/profile/serp/ultimate-camping-checklist/')).toBeNull();
  });
});

describe('buildEquivalentConsolePath, where switching context lands', () => {
  it.each([
    ['/dashboard/templates/', '/dashboard/organization/team-1/templates/'],
    ['/dashboard/templates/new/', '/dashboard/organization/team-1/templates/new/'],
    ['/dashboard/templates/tpl-1/', '/dashboard/organization/team-1/templates/'],
    ['/dashboard/templates/tpl-1/edit/', '/dashboard/organization/team-1/templates/'],
    ['/dashboard/import-templates/', '/dashboard/organization/team-1/import-templates/'],
    ['/dashboard/runs/', '/dashboard/organization/team-1/runs/'],
    ['/dashboard/runs/run-1/', '/dashboard/organization/team-1/runs/'],
    ['/dashboard/settings/', '/dashboard/organization/team-1/settings/'],
    ['/dashboard/archive/', '/dashboard/organization/team-1/archive/'],
  ])('keeps the section of %s, and leaves a Template or Run that belongs to the context left: %s', (from, to) => {
    expect(buildEquivalentConsolePath(from, acme)).toBe(to);
  });

  it('goes back to Personal the same way', () => {
    expect(buildEquivalentConsolePath('/dashboard/organization/team-1/runs/run-1/', PERSONAL_CONSOLE)).toBe(
      '/dashboard/runs/',
    );
    expect(buildEquivalentConsolePath('/dashboard/organization/team-1/settings/', PERSONAL_CONSOLE)).toBe(
      '/dashboard/settings/',
    );
  });

  it('moves between Organizations', () => {
    expect(buildEquivalentConsolePath('/dashboard/organization/team-1/archive/', organizationConsole('team-2'))).toBe(
      '/dashboard/organization/team-2/archive/',
    );
  });

  it('stays on the page when it already shows that context', () => {
    expect(buildEquivalentConsolePath('/dashboard/organization/team-1/runs/run-1', acme)).toBe(
      '/dashboard/organization/team-1/runs/run-1/',
    );
  });

  it('has no equivalent for a page that is not a console section', () => {
    expect(buildEquivalentConsolePath('/profile/serp/ultimate-camping-checklist/', acme)).toBeNull();
    expect(buildEquivalentConsolePath('/dashboard/definitely-missing/', acme)).toBeNull();
  });
});

describe('console contexts and areas', () => {
  it('compares contexts by type and Organization id', () => {
    expect(isSameConsoleContext(PERSONAL_CONSOLE, PERSONAL_CONSOLE)).toBe(true);
    expect(isSameConsoleContext(acme, organizationConsole('team-1'))).toBe(true);
    expect(isSameConsoleContext(acme, organizationConsole('team-2'))).toBe(false);
    expect(isSameConsoleContext(acme, PERSONAL_CONSOLE)).toBe(false);
    expect(isSameConsoleContext(PERSONAL_CONSOLE, acme)).toBe(false);
  });

  it('puts every Template page in the Templates area and every Run page in the Runs area, in either context', () => {
    expect(isWithinConsoleArea('/dashboard/organization/team-1/templates/new/', buildConsoleTemplatesPath(acme))).toBe(true);
    expect(isWithinConsoleArea('/dashboard/templates/tpl-1/edit/', buildConsoleTemplatesPath(acme))).toBe(true);
    expect(isWithinConsoleArea('/dashboard/organization/team-1/runs/run-1/', buildConsoleRunsPath())).toBe(true);
    expect(isWithinConsoleArea('/dashboard/organization/team-1/runs/', buildConsoleTemplatesPath(acme))).toBe(false);
    expect(isWithinConsoleArea('/templates/', buildConsoleTemplatesPath())).toBe(false);
  });
});
