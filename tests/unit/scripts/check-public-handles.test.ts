import { describe, expect, it } from 'vitest';

import { execTool } from '../../../scripts/lib/run-tool';
import { aFolderIn } from '../../support/foldersOfFiles';
import { runRepositoryScript } from '../../support/repositoryScriptRun';
import { aWorkDirRemovedAfterAll } from '../../support/workflowGuards';

const workDir = aWorkDirRemovedAfterAll('check-public-handles-');
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

function aCheckoutWithALocalD1(sql: string): { checkout: string; execute: (command: string) => void } {
  const checkout = aFolderIn(workDir, { 'wrangler.toml': WRANGLER_TOML });
  const execute = (command: string) => {
    execTool('wrangler', ['d1', 'execute', 'serp-checklists-db', '--local', '--command', command], { cwd: checkout, env, stdio: 'pipe' });
  };
  execute(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT); CREATE TABLE teams (id TEXT PRIMARY KEY, slug TEXT); ${sql}`);
  return { checkout, execute };
}

describe('pnpm run check:public-handles:local', { timeout: 120_000 }, () => {
  it('names a User and an Organization holding one handle, and exits 1 until one is renamed', () => {
    const { checkout, execute } = aCheckoutWithALocalD1(
      "INSERT INTO users VALUES ('u-1', 'Acme'), ('u-2', 'jane'), ('u-3', NULL); INSERT INTO teams VALUES ('t-1', 'acme'), ('t-2', '  ');",
    );

    const colliding = runRepositoryScript('scripts/check-public-handles.ts', [], { cwd: checkout, env });
    execute("UPDATE teams SET slug = 'acme-inc' WHERE id = 't-1'");
    const renamed = runRepositoryScript('scripts/check-public-handles.ts', [], { cwd: checkout, env });

    expect(colliding.status).toBe(1);
    expect(colliding.stdout.split('\n').filter(Boolean)).toEqual([
      'Public handles on local: 3 usernames and Organization slugs checked, 1 collision(s), 0 outside the handle rule.',
      'Collision on "acme": User u-1 ("Acme"), Organization t-1 ("acme"). Rename all but one by hand before applying 0028.',
    ]);
    expect(renamed.status).toBe(0);
    expect(renamed.stdout.trim()).toBe('Public handles on local: 3 usernames and Organization slugs checked, 0 collision(s), 0 outside the handle rule.');
  });
});
