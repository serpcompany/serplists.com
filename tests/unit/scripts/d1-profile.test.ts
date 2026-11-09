import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { scenarios } from '../../../scripts/d1-profile-lib';
import { D1_REFUSAL, LOCAL_D1_STAND_IN_FILES } from '../../fixtures/localD1PlatformStandIn';
import { stringMatching } from '../../support/asymmetricMatchers';
import type { CopyWithAStandInPackage } from '../../support/checkoutCopyWithStandIns';
import {
  aCopyWithAStandInOpenNext,
  answersOn,
  preloadInTheCopy,
  previewPortOf,
  profileOutput,
  type ProfiledStatement,
  type ProfileRun,
  runTheProfile,
  STORED_RESOURCE,
} from '../../support/d1ProfileRun';
import { parseJsonText } from '../../support/storedJson';

const CATALOG_PAGE: ProfiledStatement = {
  sql: 'select "id", "title" from "templates" where "is_public" = ? order by "created_at" desc limit ?',
  rowsRead: 12,
  rowsWritten: 0,
  rowsReturned: 10,
};
const PEOPLE_COUNT: ProfiledStatement = { sql: 'select count(*) from "users"', rowsRead: 20, rowsWritten: 0, rowsReturned: 1 };
const RETIRED_TABLE_READ: ProfiledStatement = { sql: 'select "id" from "retired_runs"', rowsRead: 5, rowsWritten: 0, rowsReturned: 0 };
const RUN_INSERT: ProfiledStatement = { sql: 'insert into "checklist_runs" ("id", "title") values (?, ?)', rowsRead: 0, rowsWritten: 1, rowsReturned: 0 };
const SETUP_READ: ProfiledStatement = { sql: 'select "sections", "version" from "templates" where "id" = ?', rowsRead: 1, rowsWritten: 0, rowsReturned: 1 };

const FREE_RUN = 'start run (Free plan, counts active runs)';

const WORKLOAD = {
  'public catalog (GET /api/templates)': [CATALOG_PAGE],
  'legacy templates list (public OR mine)': [CATALOG_PAGE],
  'profile directory, People': [PEOPLE_COUNT],
  'archived runs': [RETIRED_TABLE_READ],
  'start run': [RUN_INSERT],
  [FREE_RUN]: [RUN_INSERT],
  'setup GET /api/templates/synthetic-template-50': [SETUP_READ],
};

const COOKIE_OF = { anon: '', admin: 'better-auth.session_token=admin-session', john: 'better-auth.session_token=john-session' };

const REUSED = ['--reuse', '--scale', '0.01'];

const reportEntries = z.array(
  z
    .object({
      scenario: z.object({ name: z.string() }).passthrough(),
      status: z.number(),
      valid: z.boolean(),
      responseBody: z.string().optional(),
      queries: z.array(z.object({ sql: z.string() }).passthrough()),
    })
    .passthrough(),
);

const pristineMeta = z.object({ scale: z.number(), datasetKey: z.string() });

const readReport = (copy: CopyWithAStandInPackage) => readFileSync(profileOutput(copy, 'report.md'), 'utf8');

const readReportEntries = (copy: CopyWithAStandInPackage) => parseJsonText(readFileSync(profileOutput(copy, 'report.json'), 'utf8'), reportEntries);

const readPristineMeta = (copy: CopyWithAStandInPackage) =>
  parseJsonText(readFileSync(path.join(copy.root, '.wrangler', 'd1-profile-pristine', 'meta.json'), 'utf8'), pristineMeta);

const perRequestRows = (report: string) =>
  report.split('\n').filter((line) => line.startsWith('| ') && !line.startsWith('| Request ') && !line.startsWith('| --- '));

const statementBlocks = (report: string) => report.split('\n### ').slice(1).map((block) => block.split('\n').slice(0, 9));

const sentAs = ({ method, url, headers }: ProfileRun['requests'][number]) => `${method} ${url.pathname}${url.search} ${headers.cookie ?? ''}`;

const bodySent = (run: ProfileRun, method: string, pathname: string): unknown =>
  parseJsonText(run.requests.find((request) => request.method === method && request.url.pathname === pathname)?.body, z.unknown());

async function expectTheServerStopped(run: ProfileRun) {
  expect(previewPortOf(run)).toBeGreaterThan(0);
  await expect.poll(() => answersOn(previewPortOf(run)), { timeout: 10_000 }).toBe(false);
}

describe('pnpm run d1:profile, on a copy of the checkout whose OpenNext build is a stand-in', { timeout: 300_000 }, () => {
  let copy: CopyWithAStandInPackage;
  let profiled: ProfileRun;

  beforeAll(async () => {
    copy = await aCopyWithAStandInOpenNext();
    profiled = await runTheProfile(copy, { args: ['--scale', '0.01'], worker: { statementsOf: WORKLOAD } });
  }, 300_000);

  afterAll(() => copy.remove(), 60_000);

  it('builds the app, then the synthetic dataset at the scale asked for, and keeps a pristine copy of it', () => {
    expect(profiled.calls[0]).toEqual(['build']);
    expect(profiled.stdout).toContain('d1:profile: building the synthetic dataset at scale 0.01…');
    expect(profiled.stdout).toContain('Migrations to be applied');
    expect(readFileSync(profileOutput(copy, 'synthetic.sql'), 'utf8')).toContain('WHERE i < 200)\nINSERT INTO templates');
    expect(readPristineMeta(copy)).toEqual({ scale: 0.01, datasetKey: stringMatching(/^[0-9a-f]{64}$/) });
    expect(existsSync(path.join(copy.root, '.wrangler', 'd1-profile-pristine', 'state', 'v3'))).toBe(true);
  });

  it('serves the build with D1 profiling on and replays every request as its user, each update built on the current version', () => {
    const origin = `http://localhost:${previewPortOf(profiled)}`;
    expect(profiled.calls[1]).toEqual([
      'preview', '--port', String(previewPortOf(profiled)), '--persist-to', '.wrangler/d1-profile-state',
      '--show-interactive-dev-session=false',
      '--var', 'D1_PROFILE:true', '--var', `FRONTEND_URL:${origin}`, '--var', `CORS_ALLOWED_ORIGINS:${origin}`,
      '--var', 'BETTER_AUTH_SECRET:d1-profile-secret-at-least-32-characters',
    ]);
    const signIns = profiled.requests.filter((request) => request.url.pathname === '/api/auth/sign-in/email');
    expect(signIns.map((request) => [request.headers.origin, parseJsonText(request.body, z.unknown())])).toEqual([
      [origin, { email: 'admin@test.com', password: 'password123' }],
      [origin, { email: 'john@test.com', password: 'password123' }],
    ]);
    const replayed = profiled.requests.filter((request) => request.headers['content-type'] === 'application/json' && !signIns.includes(request));
    expect(replayed.map(sentAs)).toEqual(scenarios().map((scenario) => `${scenario.method ?? 'GET'} ${scenario.path} ${COOKIE_OF[scenario.actor]}`));
    const setups = profiled.requests.filter((request) => request.headers['content-type'] === undefined && request.url.pathname !== '/api/health');
    expect(setups.map(sentAs)).toEqual([
      `GET /api/templates/synthetic-template-50 ${COOKIE_OF.admin}`,
      `GET /api/templates/synthetic-template-40 ${COOKIE_OF.admin}`,
      `GET /api/checklists/synthetic-run-40 ${COOKIE_OF.admin}`,
    ]);
    expect(bodySent(profiled, 'PUT', '/api/templates/synthetic-template-50')).toEqual({
      sections: [...STORED_RESOURCE.sections, { id: stringMatching(/^s-profiled-\w+$/), title: 'Added', items: [{ id: stringMatching(/^i-profiled-\w+$/), title: 'New task' }] }],
      expected_version: 3,
    });
    expect(bodySent(profiled, 'PUT', '/api/checklists/synthetic-run-40')).toEqual({ progress: 75, expected_revision: 7 });
  });

  it('reports the rows each request and each statement read, with the plan SQLite chose for each read, and exits 0', () => {
    expect(profiled.status).toBe(0);
    expect(profiled.stderr).not.toContain('INVALID');
    const report = readReport(copy);
    const sizes = /^Scale 0\.01\. Table sizes: templates: ([\d,]+), checklist_runs: ([\d,]+), users: [\d,]+, audit_events: [\d,]+, template_versions: [\d,]+, team_invites: [\d,]+\.$/m.exec(report);
    expect(report.split('\n').slice(0, 4)).toEqual(['# D1 profile', '', sizes?.[0], '']);
    expect(Number(sizes?.[1]?.replaceAll(',', ''))).toBeGreaterThanOrEqual(200);
    expect(Number(sizes?.[2]?.replaceAll(',', ''))).toBeGreaterThanOrEqual(400);
    expect(report).not.toContain('INVALID');

    const rows = perRequestRows(report);
    expect(rows).toHaveLength(scenarios().length);
    expect(rows.slice(0, 4)).toEqual([
      '| profile directory, People | 200 | 1 | 20 | 0 | 1 |',
      '| public catalog (GET /api/templates) | 200 | 1 | 12 | 0 | 10 |',
      '| legacy templates list (public OR mine) | 200 | 1 | 12 | 0 | 10 |',
      '| archived runs | 200 | 1 | 5 | 0 | 0 |',
    ]);
    expect(rows).toContain('| start run | 200 | 1 | 0 | 1 | 0 |');
    expect(rows).toContain('| update template (reconciles runs) | 200 | 0 | 0 | 0 | 0 |');
    expect(rows).toContain('| sitemap templates shard (unpublished page) | 404 | 0 | 0 | 0 | 0 |');

    const code = (sql: string) => ['```sql', sql, '```'];
    expect(statementBlocks(report)).toEqual([
      [
        '1. 24 rows read in 2 call(s), max 12', '',
        '- Efficiency: 0.833; rows written: 0',
        '- Requests: public catalog (GET /api/templates), legacy templates list (public OR mine)',
        stringMatching(/^- Plan: SEARCH templates USING (COVERING )?INDEX \w+/), '',
        ...code('select … from templates where is_public = ? order by created_at desc limit ?'),
      ],
      [
        '2. 20 rows read in 1 call(s), max 20', '',
        '- Efficiency: 0.050; rows written: 0',
        '- Requests: profile directory, People',
        stringMatching(/^- Plan: SCAN users/), '',
        ...code('select count(*)… from users'),
      ],
      [
        '3. 5 rows read in 1 call(s), max 5', '',
        '- Efficiency: 0.000; rows written: 0',
        '- Requests: archived runs',
        stringMatching(/^- Plan: \(plan unavailable: .*no such table: retired_runs/), '',
        ...code('select … from retired_runs'),
      ],
      [
        '4. 0 rows read in 2 call(s), max 0', '',
        '- Efficiency: n/a; rows written: 2',
        `- Requests: start run, ${FREE_RUN}`,
        '- Plan: (write statement)', '',
        ...code('insert into checklist_runs (id, title) values (?, ?)'),
      ],
    ]);

    expect(profiled.stdout).toContain('200        20 rows read  profile directory, People');
    expect(profiled.stdout).toContain('404         0 rows read  sitemap templates shard (unpublished page)');
    expect(profiled.stdout).toContain(`Report: ${path.join('tmp', 'd1-profile', 'report.md')}`);
    const entries = readReportEntries(copy);
    expect(entries.map((entry) => [entry.scenario.name, entry.valid, entry.responseBody])).toEqual(scenarios().map((scenario) => [scenario.name, true, undefined]));
    expect(entries.find((entry) => entry.scenario.name === 'archived runs')?.queries.map((query) => query.sql)).toEqual([RETIRED_TABLE_READ.sql]);
  });

  describe('with --reuse, when a request returns another status than it expects and local D1 cannot plan or count', () => {
    let reused: ProfileRun;
    const leftover = () => path.join(copy.root, '.wrangler', 'd1-profile-state', 'left-by-the-last-run');

    beforeAll(async () => {
      writeFileSync(leftover(), 'a write the last workload made');
      reused = await runTheProfile(copy, {
        args: REUSED,
        worker: { statementsOf: WORKLOAD, instead: { [FREE_RUN]: { status: 403, body: { error: 'Free plan limit reached' } } } },
        preloads: [preloadInTheCopy(copy, LOCAL_D1_STAND_IN_FILES, 'register-local-d1-stand-in.mjs')],
      });
    }, 300_000);

    it('restores the pristine dataset instead of rebuilding it, so nothing the last run wrote carries over', () => {
      expect(reused.stdout).toContain('d1:profile: restoring the pristine scale 0.01 snapshot…');
      expect(reused.stdout).not.toContain('Migrations to be applied');
      expect(existsSync(profileOutput(copy, 'synthetic.sql'))).toBe(false);
      expect(existsSync(leftover())).toBe(false);
    });

    it('marks that request INVALID, since its rows measure an error path, and exits 1', () => {
      expect(reused.status).toBe(1);
      const report = readReport(copy);
      expect(report).toContain([
        '**INVALID: 1 request(s) returned an unexpected status, so their rows measure an error path.**', '',
        `- ${FREE_RUN}: expected 200, got 403. {"error":"Free plan limit reached"}`, '',
        '## Per request',
      ].join('\n'));
      expect(perRequestRows(report)).toContain(`| ${FREE_RUN} | INVALID (expected 200, got 403) | 1 | 0 | 1 | 0 |`);
      expect(reused.stdout).toContain(`INVALID (expected 200, got 403)        0 rows read  ${FREE_RUN}`);
      expect(reused.stderr).toContain(`INVALID ${FREE_RUN}: expected 200, got 403. {"error":"Free plan limit reached"}`);
      const invalid = readReportEntries(copy).filter((entry) => !entry.valid);
      expect(invalid.map((entry) => [entry.scenario.name, entry.status, entry.responseBody])).toEqual([[FREE_RUN, 403, '{"error":"Free plan limit reached"}']]);
    });

    it('still writes the report, with the table sizes D1 counts, when D1 cannot explain a statement, saying why for each', () => {
      const report = readReport(copy);
      expect(report).toContain('Scale 0.01. Table sizes: templates: 50, checklist_runs: 120, users: 20, audit_events: 7, template_versions: 3, team_invites: 1.');
      expect(statementBlocks(report).map((block) => block[4])).toEqual([
        `- Plan: (plan unavailable: ${D1_REFUSAL})`,
        `- Plan: (plan unavailable: ${D1_REFUSAL})`,
        `- Plan: (plan unavailable: ${D1_REFUSAL})`,
        '- Plan: (write statement)',
      ]);
    });
  });

  it('stops the server it started, and exits 1, when a seeded user cannot sign in', async () => {
    const refusal = { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' };
    const run = await runTheProfile(copy, { args: REUSED, worker: { instead: { 'sign-in admin@test.com': { status: 401, body: refusal } } } });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(`Sign-in failed for admin@test.com: 401 ${JSON.stringify(refusal)}`);
    expect(run.requests.filter((request) => request.url.pathname === '/api/auth/sign-in/email')).toHaveLength(1);
    expect(existsSync(profileOutput(copy, 'report.md'))).toBe(false);
    await expectTheServerStopped(run);
  });

  it('stops the server, naming the request, when an update cannot read the version it would update', async () => {
    const setup = 'setup GET /api/templates/synthetic-template-40';
    const run = await runTheProfile(copy, { args: REUSED, worker: { instead: { [setup]: { status: 404, body: { error: 'Template not found' } } } } });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Setup GET /api/templates/synthetic-template-40 for "update Organization template (reconciles runs)" returned 404: {"error":"Template not found"}');
    expect(run.requests.filter((request) => request.method === 'PUT').map((request) => request.url.pathname)).toEqual(['/api/templates/synthetic-template-50']);
    expect(existsSync(profileOutput(copy, 'report.md'))).toBe(false);
    await expectTheServerStopped(run);
  });

  it('profiles nothing when the build fails', async () => {
    const run = await runTheProfile(copy, { args: [], build: 'fails' });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Error: Next.js build failed');
    expect(run.stderr).toContain('Command failed:');
    expect(run.calls).toEqual([['build']]);
    expect(run.stdout).not.toContain('d1:profile:');
  });

  it('gives up when the built app never answers its health check, as when the build left no Worker to serve', async () => {
    rmSync(path.join(copy.root, '.open-next'), { recursive: true, force: true });
    const run = await runTheProfile(copy, { args: REUSED, build: 'leaves nothing' });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Error: API did not start');
    expect(run.calls.map(([command]) => command)).toEqual(['build', 'preview']);
    expect(readFileSync(profileOutput(copy, 'server.log'), 'utf8')).toContain('Could not find compiled Open Next config, did you run the build command?');
    expect(run.requests).toEqual([]);
  });

  it('fails, keeping the pristine copy, when --scale is not a number and D1 refuses the synthetic data it makes', async () => {
    const pristine = readPristineMeta(copy);
    const run = await runTheProfile(copy, { args: ['--scale', 'many'] });

    expect(run.status).toBe(1);
    expect(run.stdout).toContain('d1:profile: building the synthetic dataset at scale NaN…');
    expect(`${run.stdout}${run.stderr}`).toContain('no such column: NaN');
    expect(run.calls).toEqual([['build']]);
    expect(readPristineMeta(copy)).toEqual(pristine);
  });
});
