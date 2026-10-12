import { describe, expect, it } from 'vitest';

import { clientErrorReportSchema, scrubClientErrorReport, type ClientErrorReport } from '@/lib/schemas/clientErrorReport';

const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const FRAME = 'at onClick (https://serplists.com/_next/static/chunks/0a1b2c3d.js:1:2345)';

const report = (overrides: Partial<ClientErrorReport> = {}): ClientErrorReport => ({
  kind: 'error',
  name: 'TypeError',
  message: 'x is undefined',
  stack: `TypeError: x is undefined\n    ${FRAME}`,
  path: '/templates/',
  release: COMMIT,
  ...overrides,
});

const scrubbedMessage = (message: string) => scrubClientErrorReport(report({ message })).message;
const scrubbedPath = (path: string) => scrubClientErrorReport(report({ path })).path;
const assembled = (...parts: string[]) => parts.join('');

describe('scrubClientErrorReport, which runs in the browser before a report is sent and in the API before it is logged', () => {
  it('keeps a report that holds nothing to scrub as it was', () => {
    expect(scrubClientErrorReport(report())).toEqual(report());
  });

  it("drops the query and fragment from URLs and paths, keeping a stack frame's line and column", () => {
    const scrubbed = scrubClientErrorReport(
      report({
        message: 'Failed to fetch https://serplists.com/api/templates?scope=public&token=abc#top',
        stack: 'Error\n    at load (https://serplists.com/_next/static/chunks/page.js?v=12:3:45)',
      }),
    );

    expect(scrubbed.message).toBe('Failed to fetch https://serplists.com/api/templates');
    expect(scrubbed.stack).toBe('Error\n    at load (https://serplists.com/_next/static/chunks/page.js:3:45)');
  });

  it('drops a query string written without its path', () => {
    expect(scrubbedMessage('GET templates?email=a%40b.co&x=1 failed')).toBe('GET templates failed');
  });

  it.each([
    ['/share/3f2c9a1e-5d4b-4c1a-9b7e-2f1d0c9b8a7e/', '/share/:token/'],
    ['/team-invites/an-invite-token', '/team-invites/:token'],
    ['/api/checklists/shared/a-share-token', '/api/checklists/shared/:token'],
    ['/api/teams/invites/an-invite-token/accept', '/api/teams/invites/:token/accept'],
    ['/api/auth/reset-password/a-reset-token', '/api/auth/reset-password/:token'],
    ['/api/teams/invites/pending/invite-1', '/api/teams/invites/pending/invite-1'],
  ])('writes the secret a path carries as :token in %s', (path, scrubbed) => {
    expect(scrubbedMessage(`Request to ${path} failed`)).toBe(`Request to ${scrubbed} failed`);
  });

  it('replaces email addresses, written plain or URL-encoded', () => {
    expect(scrubbedMessage('No account for alice@example.com or bob%40example.org')).toBe('No account for [email] or [email]');
  });

  it("keeps a Firefox or Safari stack frame's function name, which an at sign joins to its URL", () => {
    const frame = 'onClick@https://serplists.com/_next/static/chunks/0a1b2c3d.js:1:2345';

    expect(scrubClientErrorReport(report({ stack: frame })).stack).toBe(frame);
  });

  it('replaces bearer tokens, Run Keys, session tokens, JSON Web Tokens and ids that may be share tokens', () => {
    const runKey = assembled('slrk', '_', 'Ab3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0eF3hJ6kM9nP2r');
    const sessionToken = assembled('k7Hq2', 'Zp9Xw4Lm1Nv8Rt5Yb3Cd6Fg0Jh2Ks9Qe');
    const webToken = [assembled('eyJ', 'hbGciOiJIUzI1NiJ9'), assembled('eyJ', 'zdWIiOiJ1c2VyLTEifQ'), 'c2lnbmF0dXJlLXNpZ25hdHVyZS1zaWduYXR1cmU'].join('.');
    const shareId = '3f2c9a1e-5d4b-4c1a-9b7e-2f1d0c9b8a7e';

    const scrubbed = scrubbedMessage(`Bearer short1 ${runKey} ${sessionToken} ${webToken} ${shareId}`);

    expect(scrubbed).toBe('Bearer [token] [token] [token] [token] [token]');
  });

  it('cuts each field to its bound', () => {
    const scrubbed = scrubClientErrorReport(
      report({ name: 'N'.repeat(500), message: 'm '.repeat(500), stack: 's\n'.repeat(5000), path: `/${'p/'.repeat(500)}` }),
    );

    expect(scrubbed.name).toHaveLength(100);
    expect(scrubbed.message).toHaveLength(300);
    expect(scrubbed.stack).toHaveLength(2000);
    expect(scrubbed.path).toHaveLength(200);
    expect(scrubbed.message.endsWith('…')).toBe(true);
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
  ])('logs %j as %j', (path, scrubbed) => {
    expect(scrubbedPath(path)).toBe(scrubbed);
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

  it('drops any field the report does not define, so nothing else a page sends is logged', () => {
    const parsed = clientErrorReportSchema.parse({ ...report(), cookie: 'session=abc', url: 'https://serplists.com/?token=x' });

    expect(parsed).toEqual(report());
  });
});
