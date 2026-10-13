import { z } from 'zod';

import { releaseCommit } from '@/lib/release';
import {
  hasSiteBundleFrame,
  scrubClientErrorReport,
  type ClientErrorKind,
  type ClientErrorReport,
} from '@/lib/schemas/clientErrorReport';

const CLIENT_ERRORS_ENDPOINT = '/api/client-errors';
const MAX_REPORTS_PER_PAGE_LOAD = 5;
const V8_DEFAULT_ERROR_NAME = 'Error';
const V8_FRAME_LINE_START = '    at ';

type ErrorReporter = (kind: ClientErrorKind, thrown: unknown, thrownAt?: string) => void;

type PageLocation = Pick<Location, 'origin' | 'pathname'>;

type ErrorEventSource = Pick<Window, 'addEventListener' | 'removeEventListener'>;

const thrownError = z.object({ name: z.string().optional(), message: z.unknown(), stack: z.string().optional() });

type ThrownError = z.infer<typeof thrownError>;

function v8StackTops(name: string | undefined, message: unknown): string[] {
  if (name === '') return typeof message === 'string' ? [message] : [];
  const names = [...new Set([name ?? V8_DEFAULT_ERROR_NAME, V8_DEFAULT_ERROR_NAME])];
  const withMessage = typeof message === 'string' ? [message, ...names.map((errorName) => `${errorName}: ${message}`)] : [];
  return [...withMessage, ...names].sort((first, second) => second.length - first.length);
}

const isV8FrameLine = (line: string): boolean => line.startsWith(V8_FRAME_LINE_START);

function v8FrameRun(text: string): string {
  const lines = text.split('\n');
  const end = lines.findIndex((line) => !isV8FrameLine(line));
  return (end === -1 ? lines : lines.slice(0, end)).join('\n');
}

function stackFramesText(stack: string, tops: readonly string[]): string {
  const top = tops.find((text) => stack.startsWith(text) && (stack.length === text.length || stack.startsWith('\n', text.length)));
  if (top !== undefined) return v8FrameRun(stack.slice(top.length + 1));
  return stack.split('\n').some(isV8FrameLine) ? '' : stack;
}

function describedError(kind: ClientErrorKind, { name, message, stack }: ThrownError, path: string): ClientErrorReport {
  return {
    kind,
    ...(name === undefined ? {} : { name }),
    ...(stack === undefined ? {} : { stack: stackFramesText(stack, v8StackTops(name, message)) }),
    path,
    release: releaseCommit(),
  };
}

export function createErrorReporter(send: (report: ClientErrorReport) => void, page: () => PageLocation): ErrorReporter {
  const reported = new Set<string>();
  return (kind, thrown, thrownAt) => {
    try {
      if (reported.size >= MAX_REPORTS_PER_PAGE_LOAD) return;
      const { origin, pathname } = page();
      const error = thrownError.safeParse(thrown);
      const scrubbed = scrubClientErrorReport(describedError(kind, error.success ? error.data : {}, pathname), origin);
      const report =
        scrubbed.stack === undefined && thrownAt !== undefined ? scrubClientErrorReport({ ...scrubbed, stack: thrownAt }, origin) : scrubbed;
      if (kind !== 'boundary' && !hasSiteBundleFrame(report, origin)) return;
      const key = `${report.name ?? ''}\n${report.stack ?? ''}`;
      if (reported.has(key)) return;
      reported.add(key);
      send(report);
    } catch {
      return;
    }
  };
}

function postReport(report: ClientErrorReport): void {
  void fetch(CLIENT_ERRORS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
    credentials: 'omit',
    keepalive: true,
  }).catch(() => undefined);
}

export const reportClientError = createErrorReporter(postReport, () => window.location);

const thrownAtOf = (event: ErrorEvent): string | undefined =>
  event.filename === '' ? undefined : `at ${event.filename}:${event.lineno}:${event.colno}`;

export function installErrorReporting(target: ErrorEventSource, report: ErrorReporter = reportClientError): () => void {
  const onError = (event: ErrorEvent) => {
    const thrown: unknown = event.error;
    report('error', thrown, thrownAtOf(event));
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason: unknown = event.reason;
    report('unhandledrejection', reason);
  };
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
