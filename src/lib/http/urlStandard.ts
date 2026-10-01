const FILE_SEGMENT = /[^/]+\.\w+$/;
const UNTOUCHED_PATH = /^\/(?:api|\.well-known)(?:\/|$)/i;
const PROFILE_PAGE_PATH = /^\/profile\/[^/]+(?:\/[^/]+)?$/i;

export function canonicalPath(pathname: string): string {
  if (!pathname.startsWith('/') || UNTOUCHED_PATH.test(pathname)) return pathname;
  const trimmed = pathname.replace(/\/+$/, '');
  if (!trimmed) return '/';
  if (PROFILE_PAGE_PATH.test(trimmed)) return `${trimmed}/`;
  const lastSegment = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  return FILE_SEGMENT.test(lastSegment) ? trimmed : `${trimmed}/`;
}

export type RedirectCondition =
  | { type: 'host'; value: string }
  | { type: 'header' | 'cookie' | 'query'; key: string; value?: string };

export interface RedirectRule {
  source: string;
  destination: string;
  permanent: boolean;
  has?: RedirectCondition[];
  missing?: RedirectCondition[];
}

const FILE = '[^/]+\\.\\w+';
const REDIRECTABLE_FIRST_SEGMENT = '(?!(?:api|\\.well-known)/)[^/]+';
const FILE_PATH_FIRST_SEGMENT = '(?!(?:api|profile|\\.well-known)/)[^/]+';
const SEGMENT_WITHOUT_SLASH = '[^/]+(?!/)';
const PAGE_SEGMENT_WITHOUT_SLASH = `(?![^/]*\\.\\w+$)${SEGMENT_WITHOUT_SLASH}`;

type RuleBuilder = (source: string, destination: string) => RedirectRule;

const filesLoseTrailingSlash = (rule: RuleBuilder): RedirectRule[] => [
  rule(`/:file(${FILE})/`, '/:file'),
  rule(`/:top(${FILE_PATH_FIRST_SEGMENT})/:file(${FILE})/`, '/:top/:file'),
  rule(`/:top(${FILE_PATH_FIRST_SEGMENT})/:dir+/:file(${FILE})/`, '/:top/:dir+/:file'),
];

const profilePagesGainTrailingSlash = (rule: RuleBuilder): RedirectRule[] => [
  rule(`/profile/:username(${SEGMENT_WITHOUT_SLASH})`, '/profile/:username/'),
  rule(`/profile/:username/:template(${SEGMENT_WITHOUT_SLASH})`, '/profile/:username/:template/'),
];

const otherPagesGainTrailingSlash = (rule: RuleBuilder): RedirectRule[] => [
  rule(`/:page((?!(?:api|\\.well-known)$)${PAGE_SEGMENT_WITHOUT_SLASH})`, '/:page/'),
  rule(`/:top(${REDIRECTABLE_FIRST_SEGMENT})/:page(${PAGE_SEGMENT_WITHOUT_SLASH})`, '/:top/:page/'),
  rule(`/:top(${REDIRECTABLE_FIRST_SEGMENT})/:dir+/:page(${PAGE_SEGMENT_WITHOUT_SLASH})`, '/:top/:dir+/:page/'),
];

export function trailingSlashRedirects(): RedirectRule[] {
  const rule: RuleBuilder = (source, destination) => ({ source, destination, permanent: true });
  return [...filesLoseTrailingSlash(rule), ...profilePagesGainTrailingSlash(rule), ...otherPagesGainTrailingSlash(rule)];
}

export function canonicalHostRedirects(
  origin: string,
  has: RedirectCondition[],
  missing: RedirectCondition[] = [],
): RedirectRule[] {
  const rule: RuleBuilder = (source, destination) => ({
    source,
    has,
    ...(missing.length ? { missing } : {}),
    destination: `${origin}${destination}`,
    permanent: true,
  });
  const untouchedPathsKeepTheirForm = [
    rule('/:ns(api|\\.well-known)/:path*/', '/:ns/:path*/'),
    rule('/:ns(api|\\.well-known)/:path*', '/:ns/:path*'),
  ];
  const profilePages = [
    rule('/profile/:username', '/profile/:username/'),
    rule('/profile/:username/:template', '/profile/:username/:template/'),
  ];
  const homepage = rule('/', '/');
  const files = [rule(`/:file(${FILE})`, '/:file'), rule(`/:dir+/:file(${FILE})`, '/:dir+/:file')];
  const everyOtherPage = rule('/:path+', '/:path+/');
  return [...untouchedPathsKeepTheirForm, ...profilePages, homepage, ...files, everyOtherPage];
}
