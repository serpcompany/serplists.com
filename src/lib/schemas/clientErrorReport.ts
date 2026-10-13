import { z } from 'zod';

import { reportedCommitSchema } from './release';

const CLIENT_ERROR_KINDS = ['boundary', 'error', 'unhandledrejection'] as const;

export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];

const LOGGED_LENGTH = { name: 100, functionName: 100, stack: 2000, path: 200 } as const;
const MAX_FIELD_LENGTH = 20_000;
const MAX_FRAMES = 20;
const SITE_BUNDLE_PATH = '/_next/static/';

const field = z.string().max(MAX_FIELD_LENGTH);

export const clientErrorReportSchema = z.object({
  kind: z.enum(CLIENT_ERROR_KINDS),
  name: field.optional(),
  stack: field.optional(),
  path: field,
  release: reportedCommitSchema,
});

export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;

const ERROR_NAME = /^[A-Za-z_$][\w$.-]*$/;
const FUNCTION_NAME = /^[\w$.<>[\]/#* -]+$/;
const LINE_AND_COLUMN = /:(\d{1,9}):(\d{1,9})$/;
const WEB_URL = /^https?:\/\//i;
const OTHER_SCHEME = /^[a-z][a-z\d+.-]{0,30}:\/\//i;
const FRAME_LABELS: ReadonlySet<string> = new Set(['<anonymous>', 'native', '[native code]']);
const EMAIL_ADDRESS = /[A-Za-z0-9._%+-]{1,64}(?:@|%40)[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,63}/gi;
const SECRET_PAGE_SEGMENT = /^(?:share|team-invites|reset-password)$/i;

const cut = (text: string, length: number): string => (text.length > length ? `${text.slice(0, length - 1)}…` : text);

export const withoutEmailAddresses = (text: string): string => text.replace(EMAIL_ADDRESS, '[email]');

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

function scrubPagePath(path: string): string {
  const [pathname = ''] = cut(path, LOGGED_LENGTH.path).split(/[?#]/, 1);
  const decoded = decodedPath(pathname);
  const segments = decoded.split('/').filter(Boolean);
  const kept = segments.map((segment, index) =>
    SECRET_PAGE_SEGMENT.test(segments[index - 1] ?? '') ? ':token' : segment,
  );
  const trailingSlash = kept.length > 0 && decoded.endsWith('/') ? '/' : '';
  return cut(withoutEmailAddresses(`/${kept.join('/')}${trailingSlash}`), LOGGED_LENGTH.path);
}

const parsedUrl = (text: string): URL | undefined => {
  try {
    return new URL(text);
  } catch {
    return undefined;
  }
};

function frameFile(file: string, origin: string): string | undefined {
  if (FRAME_LABELS.has(file)) return file;
  if (file.startsWith('/')) return scrubPagePath(file);
  if (!WEB_URL.test(file)) return OTHER_SCHEME.exec(file)?.[0];
  const url = parsedUrl(file);
  if (url === undefined) return undefined;
  const path = scrubPagePath(url.pathname);
  return url.origin === origin ? path : `${url.origin}${path}`;
}

type FrameParts = { functionName: string; location: string; scriptByPath: boolean };

function frameParts(line: string): FrameParts {
  if (line.startsWith('at ')) {
    const rest = line.slice('at '.length);
    const open = rest.indexOf(' (');
    return open > 0 && rest.endsWith(')')
      ? { functionName: rest.slice(0, open), location: rest.slice(open + 2, -1), scriptByPath: true }
      : { functionName: '', location: rest, scriptByPath: true };
  }
  const at = line.indexOf('@');
  return at === -1
    ? { functionName: '', location: line, scriptByPath: false }
    : { functionName: line.slice(0, at), location: line.slice(at + 1), scriptByPath: false };
}

const namesAScript = (script: string, positioned: boolean, scriptByPath: boolean): boolean =>
  FRAME_LABELS.has(script) || (positioned && (scriptByPath || !script.startsWith('/')));

type StackFrame = { text: string; file: string };

function stackFrame(stackLine: string, origin: string): StackFrame | undefined {
  const parts = frameParts(stackLine.trim());
  const functionName = parts.functionName.slice(0, LOGGED_LENGTH.functionName);
  if (functionName !== '' && !FUNCTION_NAME.test(functionName)) return undefined;
  const position = LINE_AND_COLUMN.exec(parts.location);
  const script = position === null ? parts.location : parts.location.slice(0, position.index);
  if (!namesAScript(script, position !== null, parts.scriptByPath)) return undefined;
  const file = frameFile(script, origin);
  if (file === undefined) return undefined;
  const [, lineNumber = '', columnNumber = ''] = position ?? [];
  const where = position === null ? file : `${file}:${lineNumber}:${columnNumber}`;
  return { text: functionName === '' ? `at ${where}` : `at ${functionName} (${where})`, file };
}

function stackLines(stack: string): string[] {
  const lines = stack.slice(0, MAX_FIELD_LENGTH).split('\n');
  return stack.length > MAX_FIELD_LENGTH ? lines.slice(0, -1) : lines;
}

function stackFrames(stack: string, origin: string): StackFrame[] {
  const frames: StackFrame[] = [];
  let length = 0;
  for (const line of stackLines(stack)) {
    const frame = line.length > LOGGED_LENGTH.stack ? undefined : stackFrame(line, origin);
    if (frame === undefined) continue;
    length += frame.text.length + 1;
    if (frames.length === MAX_FRAMES || length > LOGGED_LENGTH.stack + 1) break;
    frames.push(frame);
  }
  return frames;
}

const scrubErrorName = (name: string): string | undefined => {
  const kept = name.slice(0, LOGGED_LENGTH.name);
  return ERROR_NAME.test(kept) ? kept : undefined;
};

export function scrubClientErrorReport(report: ClientErrorReport, origin: string): ClientErrorReport {
  const { kind, name, stack, path, release } = report;
  const errorName = name === undefined ? undefined : scrubErrorName(name);
  const frames = stackFrames(stack ?? '', origin).map(({ text }) => text).join('\n');
  return {
    kind,
    ...(errorName === undefined ? {} : { name: errorName }),
    ...(frames === '' ? {} : { stack: frames }),
    path: scrubPagePath(path),
    release,
  };
}

export const hasSiteBundleFrame = (report: ClientErrorReport, origin: string): boolean =>
  stackFrames(report.stack ?? '', origin).some(({ file }) => file.startsWith(SITE_BUNDLE_PATH));
