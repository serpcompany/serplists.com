import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import { readD1Databases } from '../../../scripts/d1-baseline-migrations-lib';
import { buildToolInvocation, REPO_ROOT } from '../../../scripts/lib/run-tool';
import { runAgainstACloudflareD1StandIn } from '../../support/cloudflareD1StandIn';
import { aFolderIn } from '../../support/foldersOfFiles';
import { runRepositoryScript } from '../../support/repositoryScriptRun';
import { aWorkDirRemovedAfterAll } from '../../support/workflowGuards';

const workDir = aWorkDirRemovedAfterAll('check-public-handles-');
const execFileAsync = promisify(execFile);
const STAGING_ID = readD1Databases(readFileSync(path.join(REPO_ROOT, 'wrangler.toml'), 'utf8')).topLevel.find((entry) => entry.binding === 'DB')?.preview_database_id ?? '';
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_API_TOKEN: undefined, CLOUDFLARE_API_KEY: undefined };
const WRANGLER_TOML = [
  'name = "handles-check"',
  'compatibility_date = "2025-01-01"',
  '',
  '[[d1_databases]]',
  'binding = "DB"',
  'database_name = "serp-checklists-db"',
  'database_id = "00000000-0000-0000-0000-000000000000"',
  '',
].join('\n');

async function aCheckoutWithALocalD1(sql: string): Promise<{ checkout: string; execute: (command: string) => Promise<void> }> {
  const checkout = aFolderIn(workDir, { 'wrangler.toml': WRANGLER_TOML });
  const execute = async (command: string) => {
    const wrangler = buildToolInvocation('wrangler', ['d1', 'execute', 'serp-checklists-db', '--local', '--command', command]);
    await execFileAsync(wrangler.command, wrangler.args, { ...wrangler.options, cwd: checkout, env });
  };
  await execute(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT); CREATE TABLE teams (id TEXT PRIMARY KEY, slug TEXT); ${sql}`);
  return { checkout, execute };
}

describe('pnpm run check:public-handles:local', { timeout: 120_000 }, () => {
  it('names a User and an Organization holding one handle, and exits 1 until one is renamed', async () => {
    const { checkout, execute } = await aCheckoutWithALocalD1(
      "INSERT INTO users VALUES ('u-1', 'Acme'), ('u-2', 'jane'), ('u-3', NULL); INSERT INTO teams VALUES ('t-1', 'acme'), ('t-2', '  ');",
    );

    const colliding = await runRepositoryScript('scripts/check-public-handles.ts', [], { cwd: checkout, env });
    await execute("UPDATE teams SET slug = 'acme-inc' WHERE id = 't-1'");
    const renamed = await runRepositoryScript('scripts/check-public-handles.ts', [], { cwd: checkout, env });

    expect(colliding.status).toBe(1);
    expect(colliding.stdout.split('\n').filter(Boolean)).toEqual([
      'Public handles on local: 3 usernames and Organization slugs checked, 1 collision(s), 0 outside the handle rule.',
      'Collision on "acme": User u-1 ("Acme"), Organization t-1 ("acme"). Rename all but one by hand before applying 0028.',
    ]);
    expect(renamed.status).toBe(0);
    expect(renamed.stdout.trim()).toBe('Public handles on local: 3 usernames and Organization slugs checked, 0 collision(s), 0 outside the handle rule.');
  });
});

describe('pnpm run check:public-handles:staging, against a D1 API stand-in', { timeout: 120_000 }, () => {
  it('reads the staging database through --preview and names the collision it holds', async () => {
    const staging = new DatabaseSync(':memory:');
    staging.exec("CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT); CREATE TABLE teams (id TEXT PRIMARY KEY, slug TEXT); INSERT INTO users VALUES ('u-1', 'acme'); INSERT INTO teams VALUES ('t-1', 'acme');");

    const run = await runAgainstACloudflareD1StandIn('scripts/check-public-handles.ts', { args: ['--staging'], databases: { [STAGING_ID]: staging } });

    expect(run.status).toBe(1);
    expect(run.stdout).toContain('Public handles on staging: 2 usernames and Organization slugs checked, 1 collision(s)');
    expect(new Set(run.calls.map((call) => call.databaseId))).toEqual(new Set([STAGING_ID]));
  });

  it('checks no handles, and says so, when D1 answers the query with no result set', async () => {
    const run = await runAgainstACloudflareD1StandIn('scripts/check-public-handles.ts', {
      args: ['--staging'],
      databases: {},
      failWith: { status: 200, body: { success: true, errors: [], messages: [], result: [] } },
    });

    expect(run.status).toBe(0);
    expect(run.stdout.trim()).toBe('Public handles on staging: 0 usernames and Organization slugs checked, 0 collision(s), 0 outside the handle rule.');
  });
});
