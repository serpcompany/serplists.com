export type ConsoleContext =
  | { type: 'personal' }
  | { type: 'organization'; organizationId: string };

export type ConsoleSection =
  | { name: 'templates' }
  | { name: 'template-create' }
  | { name: 'template'; templateId: string }
  | { name: 'template-edit'; templateId: string }
  | { name: 'template-import' }
  | { name: 'runs' }
  | { name: 'run'; runId: string }
  | { name: 'settings' }
  | { name: 'archive' };

export type ConsoleRoute = { context: ConsoleContext; section: ConsoleSection };

export const PERSONAL_CONSOLE: ConsoleContext = { type: 'personal' };

export const organizationConsole = (organizationId: string): ConsoleContext => ({
  type: 'organization',
  organizationId,
});

export const ownerConsoleContext = (organizationId: string | undefined): ConsoleContext =>
  organizationId ? organizationConsole(organizationId) : PERSONAL_CONSOLE;

const DASHBOARD_SEGMENT = 'dashboard';
const ORGANIZATION_SEGMENT = 'organization';
const PERSONAL_BASE = `/${DASHBOARD_SEGMENT}/`;
const ORGANIZATION_BASE = '/dashboard/organization/';

export const ORGANIZATION_HOME_REDIRECT = {
  source: `${ORGANIZATION_BASE}:organizationId`,
  destination: `${ORGANIZATION_BASE}:organizationId/templates/`,
  permanent: false,
};

const contextBase = (context: ConsoleContext): string =>
  context.type === 'organization'
    ? `${ORGANIZATION_BASE}${encodeURIComponent(context.organizationId)}/`
    : PERSONAL_BASE;

const sectionPath = (section: ConsoleSection): string => {
  switch (section.name) {
    case 'templates':
      return 'templates/';
    case 'template-create':
      return 'templates/new/';
    case 'template':
      return `templates/${encodeURIComponent(section.templateId)}/`;
    case 'template-edit':
      return `templates/${encodeURIComponent(section.templateId)}/edit/`;
    case 'template-import':
      return 'import-templates/';
    case 'runs':
      return 'runs/';
    case 'run':
      return `runs/${encodeURIComponent(section.runId)}/`;
    case 'settings':
      return 'settings/';
    case 'archive':
      return 'archive/';
  }
};

export const buildConsoleRoutePath = ({ context, section }: ConsoleRoute): string =>
  `${contextBase(context)}${sectionPath(section)}`;

export const buildConsoleTemplatesPath = (context: ConsoleContext): string =>
  buildConsoleRoutePath({ context, section: { name: 'templates' } });

export const buildConsoleHomePath = (context: ConsoleContext): string =>
  buildConsoleTemplatesPath(context);

export const buildConsoleTemplateCreatePath = (context: ConsoleContext): string =>
  buildConsoleRoutePath({ context, section: { name: 'template-create' } });

export const buildConsoleTemplateImportPath = (context: ConsoleContext): string =>
  buildConsoleRoutePath({ context, section: { name: 'template-import' } });

export const buildConsoleTemplatePath = (
  templateId: string,
  context: ConsoleContext,
): string => buildConsoleRoutePath({ context, section: { name: 'template', templateId } });

export const buildConsoleTemplateEditPath = (
  templateId: string,
  context: ConsoleContext,
): string => buildConsoleRoutePath({ context, section: { name: 'template-edit', templateId } });

export const buildConsoleRunsPath = (context: ConsoleContext): string =>
  buildConsoleRoutePath({ context, section: { name: 'runs' } });

export const RUNS_TEMPLATE_FILTER_PARAM = 'template';

export const buildConsoleTemplateRunsPath = (templateId: string, context: ConsoleContext): string =>
  `${buildConsoleRunsPath(context)}?${new URLSearchParams({ [RUNS_TEMPLATE_FILTER_PARAM]: templateId }).toString()}`;

export const buildConsoleRunPath = (runId: string, context: ConsoleContext): string =>
  buildConsoleRoutePath({ context, section: { name: 'run', runId } });

export const buildConsoleSettingsPath = (context: ConsoleContext): string =>
  buildConsoleRoutePath({ context, section: { name: 'settings' } });

export const buildConsoleArchivePath = (context: ConsoleContext): string =>
  buildConsoleRoutePath({ context, section: { name: 'archive' } });

const SINGLE_PAGE_SECTIONS: ReadonlyMap<string, ConsoleSection> = new Map<string, ConsoleSection>([
  ['import-templates', { name: 'template-import' }],
  ['settings', { name: 'settings' }],
  ['archive', { name: 'archive' }],
]);

const parseTemplatesSection = (id: string | undefined, action: string | undefined): ConsoleSection | null => {
  if (id === undefined) return { name: 'templates' };
  if (id === 'new') return action === undefined ? { name: 'template-create' } : null;
  if (action === undefined) return { name: 'template', templateId: id };
  return action === 'edit' ? { name: 'template-edit', templateId: id } : null;
};

const parseSection = (segments: readonly string[]): ConsoleSection | null => {
  const [area, id, action, ...extra] = segments;
  if (area === undefined || extra.length > 0) return null;
  if (area === 'templates') return parseTemplatesSection(id, action);
  if (action !== undefined) return null;
  if (area === 'runs') return id === undefined ? { name: 'runs' } : { name: 'run', runId: id };
  if (id !== undefined) return null;
  return SINGLE_PAGE_SECTIONS.get(area) ?? null;
};

const decodedSegments = (pathname: string): string[] | null => {
  const path = pathname.split(/[?#]/, 1)[0] ?? '';
  if (!path.startsWith('/')) return null;
  const segments = path.slice(1).replace(/\/$/, '').split('/');
  try {
    const decoded = segments.map((segment) => decodeURIComponent(segment));
    return decoded.every((segment) => segment.length > 0) ? decoded : null;
  } catch {
    return null;
  }
};

export const parseConsoleRoute = (pathname: string): ConsoleRoute | null => {
  const segments = decodedSegments(pathname);
  if (!segments || segments[0] !== DASHBOARD_SEGMENT) return null;
  const [, first, organizationId, ...rest] = segments;
  if (first !== ORGANIZATION_SEGMENT) {
    const section = parseSection(segments.slice(1));
    return section ? { context: PERSONAL_CONSOLE, section } : null;
  }
  if (organizationId === undefined) return null;
  const section = parseSection(rest);
  return section ? { context: organizationConsole(organizationId), section } : null;
};

export const isSameConsoleContext = (left: ConsoleContext, right: ConsoleContext): boolean =>
  left.type === 'organization'
    ? right.type === 'organization' && left.organizationId === right.organizationId
    : right.type === 'personal';

const RECORD_SECTIONS: ReadonlySet<ConsoleSection['name']> = new Set(['template', 'template-edit', 'run']);

export const buildOwnerContextPath = (pathname: string, ownerContext: ConsoleContext): string | null => {
  const route = parseConsoleRoute(pathname);
  if (!route || !RECORD_SECTIONS.has(route.section.name) || isSameConsoleContext(route.context, ownerContext)) {
    return null;
  }
  return buildConsoleRoutePath({ context: ownerContext, section: route.section });
};

const listSectionOf = (section: ConsoleSection): ConsoleSection => {
  switch (section.name) {
    case 'template':
    case 'template-edit':
      return { name: 'templates' };
    case 'run':
      return { name: 'runs' };
    default:
      return section;
  }
};

export const buildEquivalentConsolePath = (pathname: string, context: ConsoleContext): string | null => {
  const route = parseConsoleRoute(pathname);
  if (!route) return null;
  if (isSameConsoleContext(route.context, context)) return buildConsoleRoutePath(route);
  return buildConsoleRoutePath({ context, section: listSectionOf(route.section) });
};

const navigationAreaOf = (section: ConsoleSection): ConsoleSection['name'] =>
  section.name === 'template-create' ? 'templates' : listSectionOf(section).name;

export const isWithinConsoleArea = (pathname: string, href: string): boolean => {
  const current = parseConsoleRoute(pathname);
  const target = parseConsoleRoute(href);
  return current !== null && target !== null && navigationAreaOf(current.section) === navigationAreaOf(target.section);
};
