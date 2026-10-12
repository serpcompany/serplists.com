import { z } from 'zod';

import { releaseCommit } from '@/lib/release';
import { scrubClientErrorReport, type ClientErrorKind, type ClientErrorReport } from '@/lib/schemas/clientErrorReport';

const CLIENT_ERRORS_ENDPOINT = '/api/client-errors';
const MAX_REPORTS_PER_PAGE_LOAD = 5;
const CROSS_ORIGIN_SCRIPT_ERROR = 'Script error.';

type ErrorReporter = (kind: ClientErrorKind, thrown: unknown) => void;

type ErrorEventSource = Pick<Window, 'addEventListener' | 'removeEventListener' | 'location'>;

const errorLike = z.object({ name: z.string().optional(), message: z.string(), stack: z.string().optional() });

const PRINTABLE_TYPES = new Set(['string', 'number', 'boolean', 'bigint', 'undefined', 'symbol']);

function describeThrown(thrown: unknown): Pick<ClientErrorReport, 'name' | 'message' | 'stack'> {
  const error = errorLike.safeParse(thrown);
  if (error.success) return error.data;
  return { message: PRINTABLE_TYPES.has(typeof thrown) ? String(thrown) : Object.prototype.toString.call(thrown) };
}

export function createErrorReporter(send: (report: ClientErrorReport) => void, pagePath: () => string): ErrorReporter {
  const reported = new Set<string>();
  return (kind, thrown) => {
    try {
      if (reported.size >= MAX_REPORTS_PER_PAGE_LOAD) return;
      const report = scrubClientErrorReport({ kind, ...describeThrown(thrown), path: pagePath(), release: releaseCommit() });
      const key = `${report.name ?? ''}\n${report.message}`;
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

export const reportClientError = createErrorReporter(postReport, () => window.location.pathname);

const isFromThisSite = (event: ErrorEvent, origin: string): boolean => {
  const thrown: unknown = event.error;
  if ((thrown === null || thrown === undefined) && event.message === CROSS_ORIGIN_SCRIPT_ERROR) return false;
  return event.filename === '' || event.filename.startsWith(`${origin}/`);
};

export function installErrorReporting(target: ErrorEventSource, report: ErrorReporter = reportClientError): () => void {
  const onError = (event: ErrorEvent) => {
    if (!isFromThisSite(event, target.location.origin)) return;
    const thrown: unknown = event.error;
    report('error', thrown ?? event.message);
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
