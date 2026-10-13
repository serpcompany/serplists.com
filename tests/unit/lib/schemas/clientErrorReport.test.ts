import { describe, expect, it } from 'vitest';

import { clientErrorReportSchema, hasSiteBundleFrame, scrubClientErrorReport, type ClientErrorReport } from '@/lib/schemas/clientErrorReport';

const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const ORIGIN = 'https://serplists.com';
const CHUNK = `${ORIGIN}/_next/static/chunks/0a1b2c3d.js`;

const report = (overrides: Partial<ClientErrorReport> = {}): ClientErrorReport => ({
  kind: 'error',
  name: 'TypeError',
  stack: 'at onClick (/_next/static/chunks/0a1b2c3d.js:1:2345)',
  path: '/templates/',
  release: COMMIT,
  ...overrides,
});

const scrubbed = (overrides: Partial<ClientErrorReport>) => scrubClientErrorReport(report(overrides), ORIGIN);
const framesOf = (stack: string) => scrubbed({ stack }).stack?.split('\n') ?? [];
const scrubbedPath = (path: string) => scrubbed({ path }).path;
const v8Frames = (...frames: string[]) => frames.map((frame) => `    at ${frame}`).join('\n');
const LOADING_FRAMES = v8Frames('JSON.parse (<anonymous>)', `loadDraft (${CHUNK}:1:2345)`, `${CHUNK}:2:10`);

describe('scrubClientErrorReport, which runs in the browser before a report is sent and in the API before it is logged', () => {
  it('keeps a report that already holds only a name, frames, a path and a release as it was', () => {
    expect(scrubClientErrorReport(report(), ORIGIN)).toEqual(report());
  });

  it('keeps the frames a stack opens with, each by its function, file, line and column', () => {
    expect(framesOf(LOADING_FRAMES)).toEqual([
      'at JSON.parse (<anonymous>)',
      'at loadDraft (/_next/static/chunks/0a1b2c3d.js:1:2345)',
      'at /_next/static/chunks/0a1b2c3d.js:2:10',
    ]);
  });

  it('keeps no frame of a stack sent with its message still on top', () => {
    const message = `SyntaxError: Unexpected token 'Q', "Q3 launch plan for alice@example.com\n    at nothing" is not valid JSON`;

    expect(scrubbed({ stack: `${message}\n${LOADING_FRAMES}` }).stack).toBeUndefined();
  });

  it("names a frame on the page's origin by its path, and drops every frame's query and fragment", () => {
    expect(framesOf(v8Frames(`load (${CHUNK}?v=12#top:3:45)`, `${ORIGIN}/templates/?q=camping:1:2`))).toEqual([
      'at load (/_next/static/chunks/0a1b2c3d.js:3:45)',
      'at /templates/:1:2',
    ]);
  });

  it("keeps another origin's frame with its origin, and a browser extension's with its scheme alone", () => {
    expect(framesOf(v8Frames('https://www.googletagmanager.com/gtm.js?id=GTM-PZZFQBGG:12:34', 'inject (chrome-extension://abcdefghijkl/content.js:1:2)'))).toEqual([
      'at https://www.googletagmanager.com/gtm.js:12:34',
      'at inject (chrome-extension://:1:2)',
    ]);
  });

  it("reads Firefox's and Safari's frames, which join a function to its file with an at sign", () => {
    const stack = [`onClick@${CHUNK}:1:2345`, `async*load@${CHUNK}:3:4`, `@${CHUNK}:5:6`, `global code@${CHUNK}:7:8`, 'forEach@[native code]', `${CHUNK}:9:10`].join('\n');

    expect(framesOf(stack)).toEqual([
      'at onClick (/_next/static/chunks/0a1b2c3d.js:1:2345)',
      'at async*load (/_next/static/chunks/0a1b2c3d.js:3:4)',
      'at /_next/static/chunks/0a1b2c3d.js:5:6',
      'at global code (/_next/static/chunks/0a1b2c3d.js:7:8)',
      'at forEach ([native code])',
      'at /_next/static/chunks/0a1b2c3d.js:9:10',
    ]);
  });

  it("writes the secret in an inline script's page as :token, and an email address as [email], as in the page's path", () => {
    expect(framesOf(v8Frames(`${ORIGIN}/share/3f2c9a1e-5d4b-4c1a-9b7e-2f1d0c9b8a7e/:3:9`, `render (${ORIGIN}/profile/alice@example.com/:1:2)`))).toEqual([
      'at /share/:token/:3:9',
      'at render (/profile/[email]/:1:2)',
    ]);
  });

  it.each([
    ['a function name holding other characters', `Error: No account for alice@${CHUNK}:1:2`],
    ['a page with no line and column', '/profile/alice/q3-plan/'],
    ['a URL with no line and column', `${ORIGIN}/profile/alice/q3-plan/`],
    ['a Firefox or Safari frame naming its script by a path, not a whole URL', 'alice@/profile/alice/q3-plan.js:1:2'],
    ['a Safari frame naming no function and its script by a path', '/profile/alice/q3-plan.js:3:4'],
    ['an index', v8Frames('async Promise.all (index 0)')],
    ['an eval', v8Frames(`eval (eval at <anonymous> (${CHUNK}:1:2), <anonymous>:1:3)`)],
    ['a data URL', v8Frames('run (data:text/javascript,alert(1):1:2)')],
    ['a blob URL', v8Frames('work (blob:https://serplists.com/0b2c9d1e:1:2)')],
    ['a cause appended below the frames', 'Caused by: TypeError: Could not load the plan'],
    ['an empty line', ''],
    ['a line over 2,000 characters, which is never read', v8Frames(`${'f'.repeat(2000)} (${CHUNK}:1:2)`)],
  ])('ends the frames at the first line it does not read as one: %s', (_label, line) => {
    expect(framesOf([v8Frames(`first (${CHUNK}:1:2)`), line, v8Frames(`last (${CHUNK}:3:4)`)].join('\n'))).toEqual([
      'at first (/_next/static/chunks/0a1b2c3d.js:1:2)',
    ]);
  });

  it('keeps an error name made of identifier characters, cut to 100, and drops any other', () => {
    expect(scrubbed({ name: 'NotAllowedError' }).name).toBe('NotAllowedError');
    expect(scrubbed({ name: 'N'.repeat(500) }).name).toHaveLength(100);
    expect(scrubbed({ name: 'Error: Q3 launch plan' }).name).toBeUndefined();
  });

  it('keeps whole frames only, at most 20 and 2,000 characters, and cuts the path to 200', () => {
    const frames = Array.from({ length: 30 }, (_, index) => `step${index} (${CHUNK}:1:${index})`);
    const longFrames = Array.from({ length: 30 }, (_, index) => `${'f'.repeat(90)}${index} (${CHUNK}:1:${index})`);

    expect(framesOf(v8Frames(...frames))).toHaveLength(20);
    const kept = framesOf(v8Frames(...longFrames));
    expect(kept.join('\n').length).toBeLessThanOrEqual(2000);
    expect(kept.every((frame) => frame.endsWith(')'))).toBe(true);
    expect(scrubbedPath(`/${'p/'.repeat(500)}`)).toHaveLength(200);
  });

  it('gives the same report when the API scrubs what the browser already scrubbed', () => {
    const once = scrubbed({ stack: v8Frames(`a (${CHUNK}:1:2)`, 'b (moz-extension://0b2c9d1e/c.js:3:4)', 'https://cdn.example.com/x/y.js?q=1:5:6') });

    expect(once.stack?.split('\n')).toHaveLength(3);
    expect(scrubClientErrorReport(once, ORIGIN)).toEqual(once);
  });
});

describe('hasSiteBundleFrame', () => {
  it("is true only when a frame runs in the site's own scripts under /_next/static/", () => {
    expect(hasSiteBundleFrame(scrubbed({ stack: v8Frames(`${CHUNK}:1:2`) }), ORIGIN)).toBe(true);
    expect(hasSiteBundleFrame(scrubbed({ stack: v8Frames(`${ORIGIN}/templates/:3:9`, '<anonymous>:1:5') }), ORIGIN)).toBe(false);
    expect(hasSiteBundleFrame(scrubbed({ stack: v8Frames('https://evil.example/_next/static/chunks/a.js:1:2') }), ORIGIN)).toBe(false);
  });
});

describe("the page path a report names, which the browser takes from the address bar", () => {
  it.each([
    ['/templates/?q=camping#reviews', '/templates/'],
    ['/share/abc/', '/share/:token/'],
    ['/SHARE/abc', '/SHARE/:token'],
    ['/%73hare/abc', '/share/:token'],
    ['//share/abc', '/share/:token'],
    ['/share/%E0%A4%A', '/share/:token'],
    ['/team-invites/an-invite-token/', '/team-invites/:token/'],
    ['/reset-password/', '/reset-password/'],
    ['/dashboard/templates/0b2c9d1e-1111-4a2b-8c3d-123456789abc/', '/dashboard/templates/0b2c9d1e-1111-4a2b-8c3d-123456789abc/'],
    ['/profile/alice@example.com/', '/profile/[email]/'],
    ['', '/'],
  ])('logs %j as %j', (path, expected) => {
    expect(scrubbedPath(path)).toBe(expected);
  });
});

describe('clientErrorReportSchema', () => {
  it('takes a report from the root error boundaries, a window error or an unhandled rejection', () => {
    for (const kind of ['boundary', 'error', 'unhandledrejection']) {
      expect(clientErrorReportSchema.safeParse({ ...report(), kind }).success, kind).toBe(true);
    }
    expect(clientErrorReportSchema.safeParse({ ...report(), kind: 'warning' }).success).toBe(false);
  });

  it('takes a release that is a commit SHA or unknown, and nothing else', () => {
    expect(clientErrorReportSchema.safeParse({ ...report(), release: 'unknown' }).success).toBe(true);
    expect(clientErrorReportSchema.safeParse({ ...report(), release: 'main' }).success).toBe(false);
  });

  it('drops any field the report does not define, a message among them, so nothing else a page sends is logged', () => {
    const parsed = clientErrorReportSchema.parse({ ...report(), message: 'Q3 launch plan', cookie: 'session=abc', url: 'https://serplists.com/?token=x' });

    expect(parsed).toEqual(report());
  });
});
