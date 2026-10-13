import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createErrorReporter, installErrorReporting, reportClientError } from '@/lib/errorReports';
import { clientErrorReportSchema, type ClientErrorReport } from '@/lib/schemas/clientErrorReport';
import { firstOf } from '../../support/elements';

const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const PAGE = window.location.origin;
const SITE_CHUNK = `${PAGE}/_next/static/chunks/0a1b2c3d.js`;
const TEMPLATE_TITLE = 'Q3 launch plan for alice@example.com';

const reporterInto = (sent: ClientErrorReport[]) =>
  createErrorReporter(
    (report) => {
      sent.push(report);
    },
    () => ({ origin: PAGE, pathname: '/templates/' }),
  );

const thrownAt = (error: Error, ...frames: string[]) =>
  Object.assign(error, { stack: [`${error.name}: ${error.message}`, ...frames.map((frame) => `    at ${frame}`)].join('\n') });

const fromSite = (error: Error, functionName = 'onClick') => thrownAt(error, `${functionName} (${SITE_CHUNK}?v=3:1:2345)`);

const rejection = (reason: unknown) => Object.assign(new Event('unhandledrejection'), { reason });

const inlineScriptError = () => thrownAt(new ReferenceError('dataLayer is not defined'), '<anonymous>:1:5', `${PAGE}/templates/:3:9`);

describe('the browser error reporter', () => {
  let uninstall: () => void = () => undefined;

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_RELEASE_COMMIT', COMMIT);
  });

  afterEach(() => {
    uninstall();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reports an error thrown by the site's own scripts with its name, frames, page path and release, and never its message", () => {
    const sent: ClientErrorReport[] = [];
    uninstall = installErrorReporting(window, reporterInto(sent));

    window.dispatchEvent(
      new ErrorEvent('error', {
        error: fromSite(new TypeError(`Cannot save "${TEMPLATE_TITLE}"`)),
        message: `Uncaught TypeError: Cannot save "${TEMPLATE_TITLE}"`,
        filename: SITE_CHUNK,
      }),
    );

    expect(sent).toEqual([
      { kind: 'error', name: 'TypeError', stack: 'at onClick (/_next/static/chunks/0a1b2c3d.js:1:2345)', path: '/templates/', release: COMMIT },
    ]);
    expect(JSON.stringify(sent)).not.toContain('Q3 launch plan');
  });

  it.each([
    ['a browser extension', { error: thrownAt(new Error('extension'), 'inject (chrome-extension://abcdef/content.js:1:2)'), filename: 'chrome-extension://abcdef/content.js' }],
    ['a third-party script', { error: thrownAt(new Error('tag'), 'https://www.googletagmanager.com/gtm.js?id=GTM-PZZFQBGG:1:2'), filename: 'https://www.googletagmanager.com/gtm.js' }],
    ["a cross-origin script, which the browser hides as 'Script error.'", { message: 'Script error.', filename: '' }],
    ["an inline script, such as a Tag Manager Custom HTML tag, which runs as the page's own URL", { error: inlineScriptError(), filename: `${PAGE}/templates/` }],
    ['an inline script that throws a value with no stack', { error: 'dataLayer push failed', filename: `${PAGE}/templates/`, lineno: 3, colno: 9 }],
  ])('leaves out an error from %s', (_label, init) => {
    const sent: ClientErrorReport[] = [];
    uninstall = installErrorReporting(window, reporterInto(sent));

    window.dispatchEvent(new ErrorEvent('error', init));

    expect(sent).toEqual([]);
  });

  it("reports an error from the site's scripts whose stack names no frame, by where the window says it was thrown", () => {
    const sent: ClientErrorReport[] = [];
    uninstall = installErrorReporting(window, reporterInto(sent));

    window.dispatchEvent(new ErrorEvent('error', { error: thrownAt(new SyntaxError('Unexpected token')), filename: SITE_CHUNK, lineno: 1, colno: 99 }));

    expect(sent.map(({ name, stack }) => ({ name, stack }))).toEqual([{ name: 'SyntaxError', stack: 'at /_next/static/chunks/0a1b2c3d.js:1:99' }]);
  });

  it("sends no line of a boundary error's message, even one shaped like a frame, when its stack names no frame", () => {
    const sent: ClientErrorReport[] = [];
    const message = `Could not save the plan\nalice@${SITE_CHUNK}:1:2`;

    reporterInto(sent)('boundary', Object.assign(new TypeError(message), { stack: `TypeError: ${message}` }));

    expect(sent).toEqual([{ kind: 'boundary', name: 'TypeError', path: '/templates/', release: COMMIT }]);
  });

  it.each([
    ['with the name its stack was written with', 'TypeError', 'TypeError'],
    ['with a name set after its stack was written', 'ApiError', 'Error'],
  ])('cuts the message off the stack, so no line of it is sent: %s', (_label, name, nameInStack) => {
    const sent: ClientErrorReport[] = [];
    const message = `Could not save\n    at Q3 acquisition of Acme (${SITE_CHUNK}:1:2)`;
    const stack = `${nameInStack}: ${message}\n    at onClick (${SITE_CHUNK}?v=3:1:2345)`;

    reporterInto(sent)('boundary', Object.assign(new Error(message), { name, stack }));

    expect(sent.map((report) => report.stack)).toEqual(['at onClick (/_next/static/chunks/0a1b2c3d.js:1:2345)']);
    expect(JSON.stringify(sent)).not.toMatch(/Q3|Acme|Could not save/);
  });

  it("reports an unhandled rejection only when its stack runs through the site's scripts", () => {
    const sent: ClientErrorReport[] = [];
    uninstall = installErrorReporting(window, reporterInto(sent));

    window.dispatchEvent(rejection(thrownAt(new Error('tag failed'), 'https://www.googletagmanager.com/gtm.js:1:2')));
    window.dispatchEvent(rejection(thrownAt(new Error('extension failed'), 'chrome-extension://abcdef/content.js:1:2')));
    window.dispatchEvent(rejection(inlineScriptError()));
    window.dispatchEvent(rejection('a plain string'));
    window.dispatchEvent(rejection({ message: `an error-like object about ${TEMPLATE_TITLE}` }));
    window.dispatchEvent(rejection(thrownAt(new TypeError('Failed to fetch'))));
    window.dispatchEvent(rejection(fromSite(new TypeError('Failed to fetch'), 'loadTemplates')));

    expect(sent).toEqual([
      { kind: 'unhandledrejection', name: 'TypeError', stack: 'at loadTemplates (/_next/static/chunks/0a1b2c3d.js:1:2345)', path: '/templates/', release: COMMIT },
    ]);
  });

  it('sends at most five reports a page load, and an error that repeats once', () => {
    const sent: ClientErrorReport[] = [];
    const report = reporterInto(sent);

    report('error', fromSite(new Error('the same error'), 'save'));
    report('boundary', fromSite(new Error('the same error, worded otherwise'), 'save'));
    for (let error = 1; error <= 6; error += 1) report('error', fromSite(new Error('another error'), `step${error}`));

    expect(sent.map(({ stack }) => stack?.split(' ')[1])).toEqual(['save', 'step1', 'step2', 'step3', 'step4']);
  });

  it('stops listening once uninstalled', () => {
    const sent: ClientErrorReport[] = [];
    installErrorReporting(window, reporterInto(sent))();

    window.dispatchEvent(rejection(fromSite(new Error('after'))));

    expect(sent).toEqual([]);
  });

  it('never lets a report that fails break the page', async () => {
    const failingSend = createErrorReporter(() => {
      throw new Error('send failed');
    }, () => window.location);
    const failingPage = createErrorReporter(() => undefined, () => {
      throw new Error('no location');
    });
    expect(() => failingSend('boundary', new Error('a'))).not.toThrow();
    expect(() => failingPage('boundary', new Error('b'))).not.toThrow();

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    expect(() => reportClientError('boundary', new Error('while offline'))).not.toThrow();
    vi.stubGlobal('fetch', undefined);
    expect(() => reportClientError('boundary', new Error('without fetch'))).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('posts a report to /api/client-errors as JSON, kept alive past the page and sent without cookies or message', () => {
    const fetchReport = vi.fn(async (_url: string, _init: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchReport);

    reportClientError('boundary', fromSite(new RangeError(`posted for ${TEMPLATE_TITLE}`), 'render'));

    expect(fetchReport).toHaveBeenCalledTimes(1);
    const [url, init] = firstOf(fetchReport.mock.calls);
    expect(url).toBe('/api/client-errors');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      keepalive: true,
    });
    expect(String(init.body)).not.toContain('posted for');
    expect(clientErrorReportSchema.parse(JSON.parse(String(init.body)))).toEqual({
      kind: 'boundary',
      name: 'RangeError',
      stack: 'at render (/_next/static/chunks/0a1b2c3d.js:1:2345)',
      path: window.location.pathname,
      release: COMMIT,
    });
  });
});
