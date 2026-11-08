import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterAll } from 'vitest';
import { z } from 'zod';

import { REPO_ROOT } from '../../scripts/lib/run-tool';
import { type ReceivedRequest, type StandInAnswer, withLocalApiStandIn } from './localApiStandIn';
import { processEnvWithout, runScriptProcess, type ScriptProcessRun } from './scriptProcess';

type D1ApiCall = { databaseId: string; action: string; body: string };

type CloudflareRun = ScriptProcessRun & { calls: D1ApiCall[] };
type StandInOptions = {
  args?: string[];
  cwd?: string;
  databases: Readonly<Record<string, DatabaseSync>>;
  env?: Readonly<Record<string, string>>;
  failWith?: StandInAnswer;
};

export const STAND_IN_PRODUCTION_ID = '00000000-0000-4000-8000-000000000001';
export const STAND_IN_STAGING_ID = '00000000-0000-4000-8000-000000000002';

function standInWranglerProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'serplists-d1-stand-in-'));
  const migrations = path.join(REPO_ROOT, 'db', 'migrations').replaceAll(path.sep, '/');
  writeFileSync(
    path.join(dir, 'wrangler.toml'),
    [
      'name = "stand-in"',
      'compatibility_date = "2025-01-01"',
      `d1_databases = [{ binding = "DB", database_name = "serp-checklists-db", database_id = "${STAND_IN_PRODUCTION_ID}", preview_database_id = "${STAND_IN_STAGING_ID}", migrations_dir = "${migrations}" }]`,
      '',
    ].join('\n'),
  );
  return dir;
}

const D1_PATH = /^\/client\/v4\/accounts\/[^/]+\/d1\/database\/([^/]+)\/(query|import)$/;
const UPLOAD_PATH = /^\/stand-in-upload\/([^/]+)$/;
const META = { duration: 1, rows_read: 0, rows_written: 0, size_after: 0 };

const queryBody = z.object({ sql: z.string() });
const importBody = z.object({ action: z.enum(['init', 'ingest']) });

const cloudflareReply = (result: unknown): StandInAnswer => ({
  status: 200,
  body: { success: true, errors: [], messages: [], result },
});

function databaseFor(databases: StandInOptions['databases'], id: string): DatabaseSync {
  const database = databases[id];
  if (!database) throw new Error(`The D1 stand-in has no database ${id}.`);
  return database;
}

function answer(request: ReceivedRequest, origin: string, options: StandInOptions, calls: D1ApiCall[]): StandInAnswer {
  const upload = UPLOAD_PATH.exec(request.url.pathname);
  if (upload?.[1] && request.method === 'PUT') {
    databaseFor(options.databases, upload[1]).exec(request.body);
    return { status: 200, body: {}, headers: { etag: `"${createHash('md5').update(request.body).digest('hex')}"` } };
  }
  const d1 = D1_PATH.exec(request.url.pathname);
  const [, databaseId = '', action = ''] = d1 ?? [];
  calls.push({ databaseId, action, body: request.body });
  if (options.failWith) return options.failWith;
  const database = databaseFor(options.databases, databaseId);
  if (action === 'query') {
    const statements = queryBody.parse(JSON.parse(request.body)).sql.split(/;\s*/).filter(Boolean);
    return cloudflareReply(statements.map((sql) => ({ results: database.prepare(sql).all(), success: true, meta: META })));
  }
  if (importBody.parse(JSON.parse(request.body)).action === 'init') {
    return cloudflareReply({ success: true, upload_url: `${origin}/stand-in-upload/${databaseId}`, filename: 'stand-in.sql' });
  }
  return cloudflareReply({
    success: true,
    status: 'complete',
    messages: [],
    result: { num_queries: 1, final_bookmark: 'stand-in', meta: META },
  });
}

export async function runAgainstACloudflareD1StandIn(script: string, options: StandInOptions): Promise<CloudflareRun> {
  const calls: D1ApiCall[] = [];
  const run = await withLocalApiStandIn(
    (request, origin) => answer(request, origin, options, calls),
    (origin) =>
      runScriptProcess(script, {
        args: options.args ?? [],
        ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
        env: {
          ...processEnvWithout(['CLOUDFLARE_', 'CF_', 'D1_', 'WRANGLER_']),
          CLOUDFLARE_API_BASE_URL: `${origin}/client/v4`,
          CLOUDFLARE_API_TOKEN: 'stand-in-token',
          CLOUDFLARE_ACCOUNT_ID: 'stand-in-account',
          WRANGLER_HIDE_BANNER: 'true',
          WRANGLER_SEND_METRICS: 'false',
          ...options.env,
        },
      }),
  );
  return { ...run, calls };
}

export const UNAUTHORIZED_ACCOUNT: StandInAnswer = {
  status: 400,
  body: { success: false, errors: [{ code: 7403, message: 'The given account is not valid or is not authorized' }], messages: [], result: null },
};

export function scriptRunInAStandInProject(script: string) {
  const project = standInWranglerProject();
  afterAll(() => rmSync(project, { recursive: true, force: true }));
  return (args: string[], databases: Record<string, DatabaseSync>, more: Pick<StandInOptions, 'env' | 'failWith'> = {}) =>
    runAgainstACloudflareD1StandIn(script, { ...more, args, cwd: project, databases });
}
