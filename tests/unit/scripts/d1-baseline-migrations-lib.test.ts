import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  parseBaselineArgs,
  readD1Databases,
  resolveBaselineTarget,
} from '../../../scripts/d1-baseline-migrations-lib.mjs';

const repoRoot = process.cwd();
const d1 = readD1Databases(readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8'));
const PRODUCTION_ID = 'b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1';
const STAGING_ID = 'fcaf4325-5be7-4ead-ab60-45932a04177b';

function resolve(argv: string[], env: Record<string, string | undefined> = {}) {
  return resolveBaselineTarget({ ...parseBaselineArgs(argv, env), d1 });
}

describe('resolveBaselineTarget against wrangler.toml', () => {
  it('refuses the DB binding on remote without --preview, because wrangler resolves it to production', () => {
    const target = resolve(['--remote', '--database', 'DB', '--through', 'latest']);
    expect(target.ok).toBe(false);
  });

  it('refuses DB from D1_DATABASE_NAME on remote without --preview', () => {
    const target = resolve(['--remote', '--through', 'latest'], { D1_DATABASE_NAME: 'DB' });
    expect(target.ok).toBe(false);
  });

  it('refuses the production database name without --allow-production', () => {
    expect(resolve(['--remote', '--database', 'serp-checklists-db']).ok).toBe(false);
    expect(resolve(['--remote', '--database=serp-checklists-db']).ok).toBe(false);
  });

  it('allows DB --preview and resolves it to the staging database', () => {
    const target = resolve(['--remote', '--database', 'DB', '--preview']);
    expect(target).toMatchObject({ ok: true, environment: 'staging', databaseId: STAGING_ID });
  });

  it('resolves the production name with --preview to staging, as wrangler does', () => {
    const target = resolve(['--remote', '--database', 'serp-checklists-db', '--preview']);
    expect(target).toMatchObject({ ok: true, environment: 'staging', databaseId: STAGING_ID });
  });

  it('allows production only with --allow-production, by name or binding', () => {
    for (const name of ['serp-checklists-db', 'DB']) {
      const target = resolve(['--remote', '--database', name, '--allow-production']);
      expect(target).toMatchObject({ ok: true, environment: 'production', databaseId: PRODUCTION_ID });
    }
  });

  it('refuses --preview together with --allow-production', () => {
    expect(resolve(['--remote', '--database', 'DB', '--preview', '--allow-production']).ok).toBe(false);
  });

  it('refuses --allow-production for a database that is not production', () => {
    const target = resolve(['--remote', '--database', 'serp-checklists-staging-db', '--allow-production']);
    expect(target.ok).toBe(false);
  });

  it('refuses a remote name wrangler would look up in the account', () => {
    expect(resolve(['--remote', '--database', 'someone-elses-db']).ok).toBe(false);
    expect(resolve(['--remote', '--database', 'someone-elses-db', '--preview']).ok).toBe(false);
  });

  it('refuses remote runs while CLOUDFLARE_ENV swaps the wrangler environment', () => {
    const target = resolve(['--remote', '--database', 'DB', '--preview'], { CLOUDFLARE_ENV: 'production' });
    expect(target.ok).toBe(false);
  });

  it('takes --database over D1_DATABASE_NAME', () => {
    expect(parseBaselineArgs(['--remote', '--database', 'serp-checklists-db'], { D1_DATABASE_NAME: 'DB' }).databaseName).toBe(
      'serp-checklists-db',
    );
    expect(parseBaselineArgs(['--remote'], { D1_DATABASE_NAME: 'DB' }).databaseName).toBe('DB');
  });

  it('needs no flag for a local run', () => {
    expect(resolve(['--local', '--database', 'DB'])).toMatchObject({ ok: true, environment: 'local' });
    expect(resolve(['--database', 'serp-checklists-db'])).toMatchObject({ ok: true, environment: 'local' });
  });

  it('refuses a preview database that is the production database', () => {
    const shared = readD1Databases(
      ['[[d1_databases]]', 'binding = "DB"', 'database_name = "prod"', 'database_id = "p-1"', 'preview_database_id = "p-1"'].join(
        '\n',
      ),
    );
    const target = resolveBaselineTarget({
      ...parseBaselineArgs(['--remote', '--database', 'DB', '--preview'], {}),
      d1: shared,
    });
    expect(target.ok).toBe(false);
  });
});

describe('readD1Databases', () => {
  it('reads the D1 entries as TOML, however wrangler.toml quotes its strings or writes its tables', () => {
    const toml = [
      "d1_databases = [{ binding = 'DB', database_name = 'prod', database_id = 'p-1', preview_database_id = 's-1' }]",
      '[env.production]',
      'd1_databases = [{ binding = "DB", database_name = """prod""", database_id = "p-1" }]',
    ].join('\n');

    expect(readD1Databases(toml)).toEqual({
      topLevel: [{ binding: 'DB', database_name: 'prod', database_id: 'p-1', preview_database_id: 's-1' }],
      production: [{ binding: 'DB', database_name: 'prod', database_id: 'p-1' }],
    });
  });

  it('reads no entries from a file with no D1 databases', () => {
    expect(readD1Databases('name = "serp-checklists"')).toEqual({ topLevel: [], production: [] });
  });
});

describe('package.json baseline scripts', () => {
  const scripts = (JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  }).scripts;
  const argvOf = (name: string) => scripts[name].split(/\s+/).slice(2);

  it('points the staging baseline at the staging database', () => {
    expect(resolve(argvOf('db:migrations:baseline:staging'))).toMatchObject({
      ok: true,
      environment: 'staging',
      databaseId: STAGING_ID,
    });
  });

  it('points the production baseline at production', () => {
    expect(resolve(argvOf('db:migrations:baseline:prod'))).toMatchObject({
      ok: true,
      environment: 'production',
      databaseId: PRODUCTION_ID,
    });
  });
});

describe('d1-baseline-migrations CLI dry runs, which never call wrangler without --execute', () => {
  function dryRun(args: string[], env: Record<string, string> = {}) {
    const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env };
    delete childEnv.CLOUDFLARE_ENV;
    if (!env.D1_DATABASE_NAME) delete childEnv.D1_DATABASE_NAME;
    return spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'd1-baseline-migrations.mjs'), ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: childEnv,
    });
  }

  it('exits non-zero for a remote DB baseline without --preview or --allow-production', () => {
    const result = dryRun(['--remote', '--database', 'DB', '--through', 'latest']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('--preview');
  });

  it('exits non-zero when D1_DATABASE_NAME=DB names the remote target', () => {
    expect(dryRun(['--remote', '--through', 'latest'], { D1_DATABASE_NAME: 'DB' }).status).not.toBe(0);
  });

  it('prints the resolved staging database on a preview dry run', () => {
    const result = dryRun(['--remote', '--database', 'DB', '--preview', '--through', 'latest']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(STAGING_ID);
    expect(result.stdout).toContain('staging');
  });
});
