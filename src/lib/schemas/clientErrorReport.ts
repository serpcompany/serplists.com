import { z } from 'zod';

import { reportedCommitSchema } from './release';

const CLIENT_ERROR_KINDS = ['boundary', 'error', 'unhandledrejection'] as const;

export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];

const LOGGED_LENGTH = { name: 100, message: 300, stack: 2000, path: 200 } as const;
const SCRUBBED_LENGTH_FACTOR = 4;
const MAX_FIELD_LENGTH = 20_000;

const field = z.string().max(MAX_FIELD_LENGTH);

export const clientErrorReportSchema = z.object({
  kind: z.enum(CLIENT_ERROR_KINDS),
  name: field.optional(),
  message: field,
  stack: field.optional(),
  path: field,
  release: reportedCommitSchema,
});

export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;

const URL_QUERY_OR_FRAGMENT = /((?:https?:)?\/[^\s?#"'<>()]*)[?#][^\s"'<>()]*?((?::\d+){0,2})(?=[\s"'<>()]|$)/gi;
const QUERY_PARAMETERS = /\?[\w.%-]+=[^\s"'<>()]*/g;
const SECRET_PATH_SEGMENT = /\/(share|shared|team-invites|reset-password|invites)\/(?!pending(?=[/\s?#"'<>()]|$))[^\s/?#"'<>()]+/gi;
const EMAIL_ADDRESS = /[A-Za-z0-9._%+-]+(?:@|%40)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gi;
const BEARER_TOKEN = /\b(Bearer)\s+[^\s"'<>()]+/gi;
const WEB_TOKEN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]*)?/g;
const LONG_SECRET = /(^|[^A-Za-z0-9_-])(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_-])/g;
const SECRET_PAGE_SEGMENT = /^(?:share|team-invites|reset-password)$/i;

const cut = (text: string, length: number): string => (text.length > length ? `${text.slice(0, length - 1)}…` : text);

const decodedOrAsSent = (text: string): string => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

const decodedPath = (pathname: string): string => {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname.split('/').map(decodedOrAsSent).join('/');
  }
};

export function scrubErrorText(text: string, length: number): string {
  const scrubbed = cut(text, length * SCRUBBED_LENGTH_FACTOR)
    .replace(URL_QUERY_OR_FRAGMENT, '$1$2')
    .replace(QUERY_PARAMETERS, '')
    .replace(SECRET_PATH_SEGMENT, '/$1/:token')
    .replace(EMAIL_ADDRESS, '[email]')
    .replace(BEARER_TOKEN, '$1 [token]')
    .replace(WEB_TOKEN, '[token]')
    .replace(LONG_SECRET, '$1[token]');
  return cut(scrubbed, length);
}

function scrubPagePath(path: string): string {
  const [pathname = ''] = path.split(/[?#]/, 1);
  const decoded = decodedPath(cut(pathname, LOGGED_LENGTH.path * SCRUBBED_LENGTH_FACTOR));
  const segments = decoded.split('/').filter(Boolean);
  const kept = segments.map((segment, index) =>
    SECRET_PAGE_SEGMENT.test(segments[index - 1] ?? '') ? ':token' : segment,
  );
  const trailingSlash = kept.length > 0 && decoded.endsWith('/') ? '/' : '';
  return cut(`/${kept.join('/')}${trailingSlash}`.replace(EMAIL_ADDRESS, '[email]'), LOGGED_LENGTH.path);
}

export function scrubClientErrorReport(report: ClientErrorReport): ClientErrorReport {
  const { kind, name, message, stack, path, release } = report;
  return {
    kind,
    ...(name === undefined ? {} : { name: scrubErrorText(name, LOGGED_LENGTH.name) }),
    message: scrubErrorText(message, LOGGED_LENGTH.message),
    ...(stack === undefined ? {} : { stack: scrubErrorText(stack, LOGGED_LENGTH.stack) }),
    path: scrubPagePath(path),
    release,
  };
}
