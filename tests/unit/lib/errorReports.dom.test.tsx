import { afterEach, describe, expect, it, vi } from 'vitest';

import { createErrorReporter, installErrorReporting, reportClientError } from '@/lib/errorReports';
import { clientErrorReportSchema, type ClientErrorReport } from '@/lib/schemas/clientErrorReport';
import { firstOf } from '../../support/elements';

const COMMIT = '0123456789abcdef0123456789abcdef01234567';

const reporterInto = (sent: ClientErrorReport[], pagePath = () => '/templates/?q=camping#top') =>
  createErrorReporter((report) => {
    sent.push(report);
  }, pagePath);

const rejection = (reason: unknown) => Object.assign(new Event('unhandledrejection'), { reason });

describe('the browser error reporter', () => {
  let uninstall: () => void = () => undefined;

  afterEach(() => {
    uninstall();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reports an error thrown by the site's own script, with the release and the page's path without its query", () => {
    vi.stubEnv('NEXT_PUBLIC_RELEASE_COMMIT', COMMIT);
    const sent: ClientErrorReport[] = [];
    uninstall = installErrorReporting(window, reporterInto(sent));

    window.dispatchEvent(
      new ErrorEvent('error', {
        error: new TypeError('x is undefined'),
        message: 'Uncaught TypeError: x is undefined',
        filename: `${window.location.origin}/_next/static/chunks/page.js`,
      }),
    );

    expect(sent).toHaveLength(1);
    expect(firstOf(sent)).toMatchObject({ kind: 'error', name: 'TypeError', message: 'x is undefined', path: '/templates/', release: COMMIT });
  });

  it.each([
    ['a browser extension', { error: new Error('extension'), filename: 'chrome-extension://abcdef/content.js' }],
    ['a third-party script', { error: new Error('tag'), filename: 'https://www.googletagmanager.com/gtm.js' }],
    ["a cross-origin script, which the browser hides as 'Script error.'", { message: 'Script error.', filename: '' }],
  ])('leaves out an error from %s', (_label, init) => {
    const sent: ClientErrorReport[] = [];
    uninstall = installErrorReporting(window, reporterInto(sent));

    window.dispatchEvent(new ErrorEvent('error', init));

    expect(sent).toEqual([]);
  });

  it('reports an unhandled rejection, describing a value that is not an error by its type alone', () => {
    const sent: ClientErrorReport[] = [];
    uninstall = installErrorReporting(window, reporterInto(sent));

    window.dispatchEvent(rejection(new Error('load failed')));
    window.dispatchEvent(rejection('a plain string'));
    window.dispatchEvent(rejection({ message: 'an error-like object' }));
    window.dispatchEvent(rejection({ email: 'alice@example.com', items: [1, 2] }));

    expect(sent.map(({ kind, name, message }) => ({ kind, name, message }))).toEqual([
      { kind: 'unhandledrejection', name: 'Error', message: 'load failed' },
      { kind: 'unhandledrejection', name: undefined, message: 'a plain string' },
      { kind: 'unhandledrejection', name: undefined, message: 'an error-like object' },
      { kind: 'unhandledrejection', name: undefined, message: '[object Object]' },
    ]);
  });

  it('sends at most five reports a page load, and an error that repeats once', () => {
    const sent: ClientErrorReport[] = [];
    const report = reporterInto(sent);

    report('error', new Error('the same error'));
    report('boundary', new Error('the same error'));
    for (let error = 1; error <= 6; error += 1) report('error', new Error(`error ${error}`));

    expect(sent.map(({ message }) => message)).toEqual(['the same error', 'error 1', 'error 2', 'error 3', 'error 4']);
  });

  it('stops listening once uninstalled', () => {
    const sent: ClientErrorReport[] = [];
    installErrorReporting(window, reporterInto(sent))();

    window.dispatchEvent(rejection(new Error('after')));

    expect(sent).toEqual([]);
  });

  it('never lets a report that fails break the page', async () => {
    const failingSend = createErrorReporter(() => {
      throw new Error('send failed');
    }, () => '/');
    const failingPath = createErrorReporter(() => undefined, () => {
      throw new Error('no location');
    });
    expect(() => failingSend('error', new Error('a'))).not.toThrow();
    expect(() => failingPath('error', new Error('b'))).not.toThrow();

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    expect(() => reportClientError('boundary', new Error('while offline'))).not.toThrow();
    vi.stubGlobal('fetch', undefined);
    expect(() => reportClientError('boundary', new Error('without fetch'))).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('posts a report to /api/client-errors as JSON, kept alive past the page and sent without cookies', () => {
    const fetchReport = vi.fn(async (_url: string, _init: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchReport);

    reportClientError('boundary', new RangeError('posted'));

    expect(fetchReport).toHaveBeenCalledTimes(1);
    const [url, init] = firstOf(fetchReport.mock.calls);
    expect(url).toBe('/api/client-errors');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      keepalive: true,
    });
    expect(clientErrorReportSchema.parse(JSON.parse(String(init.body)))).toMatchObject({
      kind: 'boundary',
      name: 'RangeError',
      message: 'posted',
      path: window.location.pathname,
    });
  });
});
