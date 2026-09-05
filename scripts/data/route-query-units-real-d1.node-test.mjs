import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import {
  createRouteQueryInstrumentationPlugin,
  discoverRouteQueryUnits,
  discoverRouteQueryUnitsFromSource,
  evaluateRouteQueryUnitCoverage,
  instrumentRouteQuerySource,
  routeQuerySourceDigest,
} from './route-query-units-lib.mjs';
import { readFileSync } from 'node:fs';

const repoRoot = process.cwd();
const require = createRequire(path.join(repoRoot, 'package.json'));
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');

test('real Drizzle batches retain atomic writes and exactly-once behavior with optional mapped statements', async () => {
  const source = `
    import { drizzle } from 'drizzle-orm/d1';
    import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
    const users = sqliteTable('users', { id: text('id').primaryKey() });
    export async function handle(env, broken) {
      const db = drizzle(env.DB);
      const statements = [db.insert(users).values({id:'base'}),
        ...['mapped'].map(id => db.insert(users).values({id})),
        ...(broken ? [db.insert(users).values({id:'base'})] : [])];
      return await db.batch(statements);
    }`;
  const transformed = instrumentRouteQuerySource(source, 'functions/transaction-batch.ts');
  for (const code of [source, transformed.code]) {
    const bundle = await build({ stdin: { contents: `${code}
      import { createRouteQueryRuntime } from './scripts/data/route-query-runtime.mjs';
      globalThis.__SERPLISTS_D1_COVERAGE__ = createRouteQueryRuntime('local');
      export default { async fetch(request, env) {
        const pathname = new URL(request.url).pathname;
        if(pathname === '/snapshot') return Response.json(globalThis.__SERPLISTS_D1_COVERAGE__.snapshot());
        if(pathname === '/rows') return Response.json((await env.DB.prepare('SELECT id FROM users ORDER BY id').all()).results);
        try { await handle(env, pathname === '/broken'); return new Response('ok'); }
        catch { return new Response('failed', {status:500}); }
      }};`, resolveDir: repoRoot, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent' });
    const mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2025-12-01', d1Databases: {DB:'drizzle-atomic-batch-local'} });
    try {
      await (await mf.getD1Database('DB')).prepare('CREATE TABLE users (id TEXT PRIMARY KEY)').run();
      assert.equal((await mf.dispatchFetch('http://localhost/broken')).status, 500);
      assert.deepEqual(await (await mf.dispatchFetch('http://localhost/rows')).json(), [], 'failed transaction leaves no partial writes');
      if (code === transformed.code) {
        const snapshot = await (await mf.dispatchFetch('http://localhost/snapshot')).json();
        assert.equal(evaluateRouteQueryUnitCoverage(transformed.units, snapshot.outcomes).counts.executed, 0);
      }
      assert.equal((await mf.dispatchFetch('http://localhost/healthy')).status, 200, 'duplicate execution would fail the primary key');
      assert.deepEqual(await (await mf.dispatchFetch('http://localhost/rows')).json(), [{id:'base'}, {id:'mapped'}]);
    } finally { await mf.dispose(); }
  }
});

test('real D1 mapped bound aliases execute final statement objects and earn coverage', async () => {
  const source = `export async function handle(env) {
    const statement = env.DB.prepare('SELECT ? AS value');
    return await env.DB.batch([1,2].map(value => statement.bind(value)));
  }`;
  const transformed = instrumentRouteQuerySource(source, 'functions/bound-batch.ts');
  const bundle = await build({ stdin: { contents: `${transformed.code}
    import { createRouteQueryRuntime } from './scripts/data/route-query-runtime.mjs';
    globalThis.__SERPLISTS_D1_COVERAGE__ = createRouteQueryRuntime('local');
    export default {async fetch(request, env) {
      const results = await handle(env);
      return Response.json({results, snapshot:globalThis.__SERPLISTS_D1_COVERAGE__.snapshot()});
    }};`, resolveDir: repoRoot, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent' });
  const mf = new Miniflare({ modules:true, script:bundle.outputFiles[0].text, compatibilityDate:'2025-12-01', d1Databases:{DB:'bound-batch-local'} });
  try {
    const response = await mf.dispatchFetch('http://localhost/');
    assert.equal(response.status, 200);
    const {results,snapshot} = await response.json();
    assert.deepEqual(results.map(result => result.results), [[{value:1}], [{value:2}]]);
    assert.equal(evaluateRouteQueryUnitCoverage(transformed.units, snapshot.outcomes).verdict, 'pass');
  } finally { await mf.dispose(); }
});

for (const variant of ['spread', 'array-alias', 'constructed-alias', 'map']) test(`a successful real batch cannot cover an unselected missing-column statement after inventory refresh: ${variant}`, async () => {
  const baseline = `export async function handle(env, broken) { return await env.DB.batch([env.DB.prepare('SELECT 1 AS value')]); }`;
  const healthy = "env.DB.prepare('SELECT 1 AS value')";
  const bad = "env.DB.prepare('SELECT missing_column FROM users')";
  const changed = variant === 'spread' ? baseline.replace(healthy, `${healthy}, ...(broken ? [${bad}] : [])`)
    : variant === 'array-alias' ? `export async function handle(env, broken) { const statements = broken ? [${bad}] : [${healthy}]; const alias = statements; return await env.DB.batch(alias); }`
    : variant === 'constructed-alias' ? `export async function handle(env, broken) { const good = ${healthy}; const bad = ${bad}; return await env.DB.batch([broken ? bad : good]); }`
    : `export async function handle(env, broken) { return await env.DB.batch([${healthy}, ...(broken ? [1] : []).map(value => ${bad})]); }`;
  for (const source of [baseline, changed]) {
    const transformed = instrumentRouteQuerySource(source, 'functions/conditional-batch.ts');
    const sourceDigest = routeQuerySourceDigest(transformed.units);
    if (source === changed) assert.notEqual(sourceDigest, routeQuerySourceDigest(discoverRouteQueryUnitsFromSource(baseline, 'functions/conditional-batch.ts')));
    const bundle = await build({ stdin: { contents: `${transformed.code}
      import { createRouteQueryRuntime } from './scripts/data/route-query-runtime.mjs';
      globalThis.__SERPLISTS_D1_COVERAGE__ = createRouteQueryRuntime('${sourceDigest}');
      export default { async fetch(request, env) {
        if (new URL(request.url).pathname === '/snapshot') return Response.json(globalThis.__SERPLISTS_D1_COVERAGE__.snapshot());
        try { return Response.json(await handle(env, new URL(request.url).pathname === '/broken')); }
        catch { return new Response('query failed', { status: 500 }); }
      }};`, resolveDir: repoRoot, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent' });
    const mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2025-12-01', d1Databases: { DB: 'conditional-batch-local' } });
    try {
      await (await mf.getD1Database('DB')).prepare('CREATE TABLE users (id TEXT)').run();
      const response = await mf.dispatchFetch('http://localhost/healthy');
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json())[0].results, [{ value: 1 }]);
      const snapshot = await (await mf.dispatchFetch('http://localhost/snapshot')).json();
      assert.equal(snapshot.sourceDigest, sourceDigest);
      const coverage = evaluateRouteQueryUnitCoverage(transformed.units, snapshot.outcomes);
      assert.equal(coverage.verdict, source === baseline ? 'pass' : 'fail');
      if (source === changed) {
        assert.equal(coverage.counts.missing, 1);
        assert.equal((await mf.dispatchFetch('http://localhost/broken')).status, 500);
        const after = await (await mf.dispatchFetch('http://localhost/snapshot')).json();
        const failed = evaluateRouteQueryUnitCoverage(transformed.units, after.outcomes);
        assert.equal(failed.verdict, 'fail');
        assert.equal(failed.counts.failed, 1);
      }
    } finally { await mf.dispose(); }
  }
});

test('instrumented application handlers emit successful units from real Worker and D1 execution', async () => {
  const authSource = readFileSync(path.join(repoRoot, 'functions/api/handlers/auth.ts'), 'utf8');
  const authQueries = discoverRouteQueryUnitsFromSource(authSource, 'functions/api/handlers/auth.ts')
    .filter((unit) => unit.kind === 'query');
  const sourceDigest = routeQuerySourceDigest(discoverRouteQueryUnits(repoRoot));
  const entry = `
    import api from './functions/api/[[route]].ts';
    import { createRouteQueryRuntime } from './scripts/data/route-query-runtime.mjs';
    globalThis.__SERPLISTS_D1_COVERAGE__ = createRouteQueryRuntime('${sourceDigest}');
    export default { async fetch(request, env) {
      if (new URL(request.url).pathname === '/__test-only/route-query-units') {
        return Response.json(globalThis.__SERPLISTS_D1_COVERAGE__.snapshot());
      }
      return api.fetch(request, env);
    }};
  `;
  const bundle = await build({
    stdin: { contents: entry, resolveDir: repoRoot, loader: 'ts' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    conditions: ['workerd', 'worker', 'browser'],
    external: ['node:*'],
    target: 'es2022',
    logLevel: 'silent',
    plugins: [createRouteQueryInstrumentationPlugin({ repoRoot })],
  });
  const mf = new Miniflare({
    modules: true,
    script: bundle.outputFiles[0].text,
    compatibilityDate: '2025-12-01',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: { DB: 'route-query-real-d1' },
    bindings: {
      BETTER_AUTH_SECRET: 'route-query-real-d1-secret-at-least-32-chars',
      FRONTEND_URL: 'http://localhost',
    },
  });
  try {
    const db = await mf.getD1Database('DB');
    await db.prepare(`CREATE TABLE users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT, name TEXT,
      avatar_url TEXT, username TEXT, display_username TEXT, email_verified INTEGER NOT NULL DEFAULT 0,
      auth_created_at INTEGER, auth_updated_at INTEGER, affiliate_code TEXT, referral_count INTEGER DEFAULT 0,
      total_earnings REAL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT
    )`).run();
    await db.prepare("INSERT INTO users(id,email,name,username,created_at) VALUES('route-unit-user','route-unit@e2e.local','Route Unit','route_unit','2026-09-05')").run();

    for (const route of [
      '/api/profiles/by-username?username=route_unit',
      '/api/profiles/by-id?userId=route-unit-user',
    ]) {
      const response = await mf.dispatchFetch(`http://localhost${route}`);
      assert.equal(response.status, 200, await response.text());
    }
    const evidenceResponse = await mf.dispatchFetch('http://localhost/__test-only/route-query-units');
    const snapshot = await evidenceResponse.json();
    assert.equal(snapshot.sourceDigest, sourceDigest);
    const authQueryIds = new Set(authQueries.map((unit) => unit.id));
    const result = evaluateRouteQueryUnitCoverage(
      authQueries,
      snapshot.outcomes.filter((unit) => authQueryIds.has(unit.id)),
    );
    assert.equal(authQueries.length, 2);
    assert(snapshot.outcomes.some((unit) => unit.id.startsWith('endpoint:')), 'actual router endpoint branches execute');
    assert.equal(result.verdict, 'pass');
    assert.deepEqual(result.counts, { discovered: 2, executed: 2, excluded: 0, missing: 0, failed: 0 });
  } finally {
    await mf.dispose();
  }
});

test('exec, relational, literal-computed and nested queries execute against real D1 and reject missing columns', async () => {
  const source = `
    import { drizzle } from 'drizzle-orm/d1';
    import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
    const users = sqliteTable('users', { id: text('id').primaryKey() });
    export async function handle(env, broken) {
      const db = drizzle(env.DB, { schema: { users } });
      if (broken) return await env.DB.exec('SELECT missing_column FROM users');
      return await Promise.all([
        env.DB.exec('SELECT id FROM users'),
        db.query.users.findMany(),
        db['select']().from(users),
        env.DB.prepare('SELECT ? AS value').bind((await db.query.users.findFirst()).id).first(),
      ]);
    }
  `;
  const transformed = instrumentRouteQuerySource(source, 'functions/query-forms.ts');
  assert.equal(transformed.units.length, 6, 'each nested or conditional query has one unit');
  const sourceDigest = routeQuerySourceDigest(transformed.units);
  const bundle = await build({
    stdin: { contents: `${transformed.code}
      import { createRouteQueryRuntime } from './scripts/data/route-query-runtime.mjs';
      globalThis.__SERPLISTS_D1_COVERAGE__ = createRouteQueryRuntime('${sourceDigest}');
      export default { async fetch(request, env) {
        if (new URL(request.url).pathname === '/snapshot') return Response.json(globalThis.__SERPLISTS_D1_COVERAGE__.snapshot());
        try { return Response.json(await handle(env, new URL(request.url).pathname === '/broken')); }
        catch { return new Response('query failed', { status: 500 }); }
      }};
    `, resolveDir: repoRoot, loader: 'ts' },
    bundle: true, write: false, format: 'esm', platform: 'browser',
    conditions: ['workerd', 'worker', 'browser'], external: ['node:*'], target: 'es2022', logLevel: 'silent',
  });
  const mf = new Miniflare({
    modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2025-12-01', compatibilityFlags: ['nodejs_compat'],
    d1Databases: { DB: 'query-forms-local-only' },
  });
  try {
    const db = await mf.getD1Database('DB');
    await db.prepare('CREATE TABLE users (id TEXT PRIMARY KEY)').run();
    await db.prepare("INSERT INTO users (id) VALUES ('fixture')").run();
    const response = await mf.dispatchFetch('http://localhost/positive');
    assert.equal(response.status, 200);
    const [, relational, computed, nested] = await response.json();
    assert.deepEqual(relational, [{ id: 'fixture' }]);
    assert.deepEqual(computed, relational);
    assert.deepEqual(nested, { value: 'fixture' });
    const before = await (await mf.dispatchFetch('http://localhost/snapshot')).json();
    assert.equal(before.sourceDigest, sourceDigest);
    const missing = evaluateRouteQueryUnitCoverage(transformed.units, before.outcomes);
    assert.equal(missing.verdict, 'fail');
    assert.equal(missing.counts.executed, 5);
    assert.equal(missing.counts.missing, 1);
    assert.equal((await mf.dispatchFetch('http://localhost/broken')).status, 500);
    const after = await (await mf.dispatchFetch('http://localhost/snapshot')).json();
    const failed = evaluateRouteQueryUnitCoverage(transformed.units, after.outcomes);
    assert.equal(failed.verdict, 'fail');
    assert.equal(failed.counts.failed, 1);
    assert.equal(failed.counts.missing, 0);
  } finally { await mf.dispose(); }
});
