import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import {
  createRouteQueryInstrumentationPlugin,
  discoverRouteQueryUnits,
  discoverRouteQueryUnitsFromSource,
  evaluateRouteQueryUnitCoverage,
  routeQuerySourceDigest,
} from './route-query-units-lib.mjs';
import { readFileSync } from 'node:fs';

const repoRoot = process.cwd();
const require = createRequire(path.join(repoRoot, 'package.json'));
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');

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
