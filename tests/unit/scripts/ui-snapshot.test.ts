import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import { devices } from '@playwright/test';
import { afterAll, describe, expect, it } from 'vitest';

import { aCopyOfTheCheckoutWithStandIns, runTheCopysScriptToTheEnd } from '../../support/checkoutCopyWithStandIns';
import { aFolderIn } from '../../support/foldersOfFiles';
import { whileServingLocally } from '../../support/localHttpServer';
import { PLAYWRIGHT_STAND_IN, whatTheBrowserWasAskedIn } from '../../support/playwrightStandIn';
import { aWorkDirRemovedAfterAll } from '../../support/workflowGuards';

const copy = await aCopyOfTheCheckoutWithStandIns(PLAYWRIGHT_STAND_IN);
const workDir = aWorkDirRemovedAfterAll('ui-snapshot-');

afterAll(() => copy.remove());

const PAGES: Record<string, { status: number; body: string }> = {
  '/dashboard/templates': {
    status: 200,
    body:
      '<html><head><title>My Templates | SERP Lists</title></head><body><h1>My Templates</h1>' +
      '<img src="/missing.png"><img src="/logo.png"><script>console.error("Hydration failed")</script>' +
      '<script>console.log("ready")</script><script>throw new Error("boom")</script></body></html>',
  },
  '/': { status: 200, body: '<html><head><title>SERP Lists</title></head><body><h1>Checklists</h1></body></html>' },
  '/logo.png': { status: 200, body: 'png' },
};

type Received = { route: string; origin: string | undefined; body: string };

async function snapshot(args: readonly string[], files: (port: string) => Record<string, string> = () => ({})) {
  const received: Received[] = [];
  const answer = (request: IncomingMessage, response: ServerResponse) => {
    void text(request).then((body) => {
      const route = `${request.method ?? 'GET'} ${request.url ?? '/'}`;
      received.push({ route, origin: request.headers.origin, body });
      const signedIn = route.endsWith('/auth/sign-in/email') && body.includes('"password":"password123"');
      const page = route.startsWith('POST ') ? { status: signedIn ? 200 : 401, body: '{}' } : (PAGES[request.url ?? '/'] ?? { status: 404, body: 'Not found' });
      response.writeHead(page.status).end(page.body);
    });
  };
  return whileServingLocally(answer, async (origin) => {
    const port = new URL(origin).port;
    const cwd = aFolderIn(workDir, files(port));
    const run = await runTheCopysScriptToTheEnd(copy, 'scripts/ui-snapshot.ts', { args: args.map((arg) => arg.replace('{origin}', origin)), cwd });
    return { run, cwd, port, received };
  });
}

const sessionFor = (port: string) => ({ 'tmp/dev-session.json': JSON.stringify({ port: Number(port) }) });

describe('pnpm run ui:snap with a stand-in browser', { timeout: 300_000 }, () => {
  it("signs in, snapshots the route from the dev server the session names, and lists the page's console errors and failed requests", async () => {
    const { run, cwd, port, received } = await snapshot(['dashboard/templates', '--login', 'owner@test.com'], sessionFor);
    const screenshot = path.join('tmp', 'snapshots', 'dashboard-templates.png');
    const aria = path.join('tmp', 'snapshots', 'dashboard-templates.aria.yml');
    const app = `http://localhost:${port}`;

    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toBe(
      [
        `URL:        ${app}/dashboard/templates`,
        'Title:      My Templates | SERP Lists',
        `Screenshot: ${screenshot}`,
        `Aria YAML:  ${aria}`,
        'Console errors (2):',
        '  Hydration failed',
        '  boom',
        'Failed requests (1):',
        `  404 GET ${app}/missing.png`,
        '',
        'Accessibility tree:',
        '- heading "My Templates" [level=1]',
        '',
      ].join('\n'),
    );
    expect(readFileSync(path.join(cwd, screenshot), 'utf8')).toBe(`a screenshot of ${app}/dashboard/templates`);
    expect(readFileSync(path.join(cwd, aria), 'utf8')).toBe('- heading "My Templates" [level=1]');
    expect(received[0]).toEqual({ route: 'POST /api/auth/sign-in/email', origin: app, body: '{"email":"owner@test.com","password":"password123"}' });
    expect(whatTheBrowserWasAskedIn(cwd)).toEqual([
      { launched: true },
      { context: { viewport: { width: 1440, height: 900 } } },
      { goto: `${app}/dashboard/templates`, options: { waitUntil: 'networkidle' } },
      { screenshot: { path: screenshot, fullPage: true } },
      { ariaSnapshotOf: 'body' },
      { closed: true },
    ]);
  });

  it('opens the app at --base as an iPhone 13, signed out, and writes the screenshot and its YAML where --out says', async () => {
    const { run, cwd, port, received } = await snapshot(['/', '--mobile', '--base', '{origin}', '--out', 'shots/phone/home.jpg']);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain(`URL:        http://127.0.0.1:${port}/\nTitle:      SERP Lists\n`);
    expect(run.stdout).toContain('Console errors (0):\nFailed requests (0):\n');
    expect(readFileSync(path.join(cwd, 'shots', 'phone', 'home.aria.yml'), 'utf8')).toBe('- heading "Checklists" [level=1]');
    expect(existsSync(path.join(cwd, 'shots', 'phone', 'home.jpg'))).toBe(true);
    expect(received.map(({ route }) => route)).toEqual(['GET /']);
    expect(whatTheBrowserWasAskedIn(cwd)).toContainEqual({ context: devices['iPhone 13'] });
  });

  it('stops, closing the browser, when the API at --api refuses the sign-in, and says how to seed the users', async () => {
    const { run, cwd, port, received } = await snapshot([
      'templates',
      '--base',
      '{origin}',
      '--api',
      '{origin}/custom-api',
      '--login',
      'nobody@test.com',
      '--password',
      'wrong',
    ]);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Sign-in as nobody@test.com failed (401). Seed users with `pnpm run db:seed`.');
    expect(received).toEqual([
      { route: 'POST /custom-api/auth/sign-in/email', origin: `http://127.0.0.1:${port}`, body: '{"email":"nobody@test.com","password":"wrong"}' },
    ]);
    expect(whatTheBrowserWasAskedIn(cwd).slice(-1)).toEqual([{ closed: true }]);
    expect(existsSync(path.join(cwd, 'tmp', 'snapshots'))).toBe(false);
  });

  it.each([
    [['dashboard', '--out', 'tmp/shot.gif'], '--out must end in .png, .jpg, .jpeg, .jpe (lowercase), got "tmp/shot.gif".'],
    [['dashboard', '--full'], 'Unknown flag --full.'],
  ])('refuses %j before it opens a browser, with its usage, and exits 2', async (args, message) => {
    const cwd = aFolderIn(workDir);

    const run = await runTheCopysScriptToTheEnd(copy, 'scripts/ui-snapshot.ts', { args, cwd });

    expect(run.status).toBe(2);
    expect(run.stderr).toContain(message);
    expect(run.stderr).toContain('Usage: pnpm run ui:snap -- [route]');
    expect(existsSync(path.join(cwd, 'playwright-stand-in.jsonl'))).toBe(false);
  });
});
