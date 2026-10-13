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

type ErrorReporter = (kind: ClientErrorKind, thrown: unknown, thrownAt?: string) => void;

type PageLocation = Pick<Location, 'origin' | 'pathname'>;

type ErrorEventSource = Pick<Window, 'addEventListener' | 'removeEventListener'>;

const thrownError = z.object({ name: z.string().optional(), stack: z.string().optional() });

export function createErrorReporter(send: (report: ClientErrorReport) => void, page: () => PageLocation): ErrorReporter {
  const reported = new Set<string>();
  return (kind, thrown, thrownAt) => {
    try {
      if (reported.size >= MAX_REPORTS_PER_PAGE_LOAD) return;
      const { origin, pathname } = page();
      const error = thrownError.safeParse(thrown);
      const described = { kind, ...(error.success ? error.data : {}), path: pathname, release: releaseCommit() };
      const scrubbed = scrubClientErrorReport(described, origin);
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
