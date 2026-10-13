import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createErrorReporter, installErrorReporting, reportClientError } from '@/lib/errorReports';
import { clientErrorReportSchema, type ClientErrorReport } from '@/lib/schemas/clientErrorReport';
import { firstOf } from '../../support/elements';

const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const PAGE = window.location.origin;
const SITE_CHUNK = `${PAGE}/_next/static/chunks/0a1b2c3d.js`;
const TEMPLATE_TITLE = 'Q3 launch plan for alice@example.com';
const SAVE_FAILURE = `Could not save "Q3 plan"\nalice@${SITE_CHUNK}:1:2\n${PAGE}/profile/alice/q3-plan:3:4`;

const reporterInto = (sent: ClientErrorReport[]) =>
  createErrorReporter(
    (report) => {
      sent.push(report);
    },
    () => ({ origin: PAGE, pathname: '/templates/' }),
  );

const v8StackTop = ({ name, message }: Error) => (message === '' ? name : `${name}: ${message}`);

const thrownAt = (error: Error, ...frames: string[]) =>
  Object.assign(error, { stack: [v8StackTop(error), ...frames.map((frame) => `    at ${frame}`)].join('\n') });

const withMessageSetAfterItsStackWasRead = (error: Error, message: string) => {
  expect(error.stack).toContain(`alice@${SITE_CHUNK}`);
  return Object.assign(error, { message });
};

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

  it.each([
    ['names no frame', () => thrownAt(new SyntaxError('Unexpected token'))],
    ['was read before its message changed', () => withMessageSetAfterItsStackWasRead(new SyntaxError(SAVE_FAILURE), 'Unexpected token')],
  ])("reports an error from the site's scripts whose stack %s, by where the window says it was thrown", (_label, error) => {
    const sent: ClientErrorReport[] = [];
    uninstall = installErrorReporting(window, reporterInto(sent));

    window.dispatchEvent(new ErrorEvent('error', { error: error(), filename: SITE_CHUNK, lineno: 1, colno: 99 }));

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
    ["with a name holding ': '", 'Error: E_SAVE', 'Error: E_SAVE'],
    ["under Error, as Chrome writes a DOMException's stack", 'DataCloneError', 'Error'],
  ])('cuts the message off the stack, so no line of it is sent: %s', (_label, name, nameInStack) => {
    const sent: ClientErrorReport[] = [];
    const message = `Could not save\n    at Q3 acquisition of Acme (${SITE_CHUNK}:1:2)`;
    const stack = `${nameInStack}: ${message}\n    at onClick (${SITE_CHUNK}?v=3:1:2345)`;

    reporterInto(sent)('boundary', Object.assign(new Error(message), { name, stack }));

    expect(sent.map((report) => report.stack)).toEqual(['at onClick (/_next/static/chunks/0a1b2c3d.js:1:2345)']);
    expect(JSON.stringify(sent)).not.toMatch(/Q3|Acme|Could not save/);
  });

  it.each([
    ['changed', 'Request failed'],
    ['prefixed', `Saving failed: ${SAVE_FAILURE}`],
    ['cleared', ''],
    ['cut to its first line', 'Could not save "Q3 plan"'],
  ])('sends no frame of a stack read before its message was %s', (_label, message) => {
    const sent: ClientErrorReport[] = [];

    reporterInto(sent)('boundary', withMessageSetAfterItsStackWasRead(new Error(SAVE_FAILURE), message));

    expect(sent).toEqual([{ kind: 'boundary', name: 'Error', path: '/templates/', release: COMMIT }]);
  });

  it('sends no frame from an error with no name whose message changed after its stack was written, since its stack opens with the old message', () => {
    const sent: ClientErrorReport[] = [];
    const error = Object.assign(new Error(`    at Q3 acquisition of Acme (${SITE_CHUNK}:1:2)`), { name: '' });
    const stack = `${error.message}\n    at onClick (${SITE_CHUNK}?v=3:1:2345)`;

    reporterInto(sent)('boundary', Object.assign(error, { stack, message: 'Request failed' }));

    expect(sent.map((report) => report.stack)).toEqual([undefined]);
    expect(JSON.stringify(sent)).not.toMatch(/Q3|Acme/);
  });

  it.each([
    ['Firefox', [`onClick@${SITE_CHUNK}:1:2`, `async*load@${SITE_CHUNK}:3:4`]],
    ['Safari', [`onClick@${SITE_CHUNK}:1:2`, `global code@${SITE_CHUNK}:3:4`]],
  ])("reports a %s error from the site's scripts with its frames, since those engines keep no message in a stack", (_engine, frames) => {
    const sent: ClientErrorReport[] = [];
    uninstall = installErrorReporting(window, reporterInto(sent));

    window.dispatchEvent(new ErrorEvent('error', { error: Object.assign(new TypeError('Cannot save'), { stack: frames.join('\n') }), filename: SITE_CHUNK }));

    expect(sent.map((report) => report.stack?.split('\n'))).toEqual([
      [`at onClick (/_next/static/chunks/0a1b2c3d.js:1:2)`, `at ${frames[1]?.split('@')[0] ?? ''} (/_next/static/chunks/0a1b2c3d.js:3:4)`],
    ]);
  });

  it('sends only the unbroken run of frames below the top, so nothing appended after them, such as a cause', () => {
    const sent: ClientErrorReport[] = [];
    const stack = ['Error: Save failed', `    at onClick (${SITE_CHUNK}:5:6)`, `Caused by: TypeError: ${SAVE_FAILURE}`, `    at load (${SITE_CHUNK}:7:8)`];

    reporterInto(sent)('boundary', Object.assign(new Error('Save failed'), { stack: stack.join('\n') }));

    expect(sent.map((report) => report.stack)).toEqual(['at onClick (/_next/static/chunks/0a1b2c3d.js:5:6)']);
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
    window.dispatchEvent(rejection(Object.assign(fromSite(new RangeError(), 'parseDraft'), { message: null })));

    expect(sent).toEqual([
      { kind: 'unhandledrejection', name: 'TypeError', stack: 'at loadTemplates (/_next/static/chunks/0a1b2c3d.js:1:2345)', path: '/templates/', release: COMMIT },
      { kind: 'unhandledrejection', name: 'RangeError', stack: 'at parseDraft (/_next/static/chunks/0a1b2c3d.js:1:2345)', path: '/templates/', release: COMMIT },
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
