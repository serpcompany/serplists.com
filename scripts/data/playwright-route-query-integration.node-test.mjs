import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { buildInstrumentedPlaywrightWorker, ROUTE_QUERY_SNAPSHOT_PATH } from './build-instrumented-playwright-worker.mjs';
import RouteQueryPlaywrightReporter, { captureRouteQuerySnapshot } from './route-query-playwright-reporter.mjs';
import { discoverRouteQueryUnitsFromSource } from './route-query-units-lib.mjs';

const repoRoot = process.cwd();

test('browser helper preserves generated Pages routing and asset fallback in the test bundle', async () => {
  const directory = mkdtempSync(path.join(repoRoot, 'tmp', 'issue127-worker-'));
  const outputPath = path.join(directory, 'worker.mjs');
  try {
    const result = await buildInstrumentedPlaywrightWorker({ repoRoot, outputPath });
    assert.match(result.sourceDigest, /^[a-f0-9]{64}$/);
    const bundle = readFileSync(outputPath, 'utf8');
    assert(bundle.includes(ROUTE_QUERY_SNAPSHOT_PATH));
    assert(bundle.includes('__SERPLISTS_D1_COVERAGE__'));

    const { default: worker } = await import(`${pathToFileURL(outputPath).href}?test=${Date.now()}`);
    const assetRequests = [];
    const env = {
      ASSETS: {
        async fetch(request) {
          assetRequests.push(request);
          return new Response('controlled asset adapter', {
            status: 203,
            headers: { 'X-Asset-Adapter': 'true' },
          });
        },
      },
    };
    const executionContext = {
      waitUntil() {},
      passThroughOnException() {},
    };

    const pagesResponse = await worker.fetch(
      new Request('https://example.test/sitemaps/static.xml?page=7'),
      env,
      executionContext,
    );
    assert.equal(pagesResponse.status, 308);
    assert.equal(pagesResponse.headers.get('location'), 'https://serplists.com/sitemaps/pages/7.xml');
    assert.equal(assetRequests.length, 0, 'a matched non-API Pages Function must not fall through to assets');

    const methodResponse = await worker.fetch(
      new Request('https://example.test/sitemaps/static.xml', { method: 'POST' }),
      env,
      executionContext,
    );
    assert.equal(methodResponse.status, 405);
    assert.equal(assetRequests.length, 0);

    const assetResponse = await worker.fetch(
      new Request('https://example.test/robots.txt'),
      env,
      executionContext,
    );
    assert.equal(assetResponse.status, 203);
    assert.equal(assetResponse.headers.get('x-asset-adapter'), 'true');
    assert.equal(await assetResponse.text(), 'controlled asset adapter');
    assert.equal(assetRequests.length, 1);
    assert.equal(assetRequests[0].url, 'https://example.test/robots.txt');

    const snapshotResponse = await worker.fetch(
      new Request(`https://example.test${ROUTE_QUERY_SNAPSHOT_PATH}`),
      env,
      executionContext,
    );
    assert.equal(snapshotResponse.status, 200);
    const snapshot = await snapshotResponse.json();
    assert.equal(snapshot.sourceDigest, result.sourceDigest);
    const staticSitemapSourcePath = 'functions/sitemaps/static.xml.ts';
    const [staticSitemapMethodUnit] = discoverRouteQueryUnitsFromSource(
      readFileSync(path.join(repoRoot, staticSitemapSourcePath), 'utf8'),
      staticSitemapSourcePath,
    );
    assert.deepEqual(
      snapshot.outcomes.find((outcome) => outcome.id === staticSitemapMethodUnit.id),
      { id: staticSitemapMethodUnit.id, outcome: 'success' },
      'the Wrangler router must execute the instrumented original non-API Functions source',
    );
    assert.equal(assetRequests.length, 1, 'the generated test-only snapshot route must stay outside asset fallback');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Playwright reporter records the real snapshot only after a passing run', async () => {
  const directory = mkdtempSync(path.join(repoRoot, 'tmp', 'issue127-reporter-'));
  const proofPath = path.join(directory, 'route-coverage.json');
  const keys = [
    'PLAYWRIGHT_ROUTE_QUERY_EVIDENCE', 'PLAYWRIGHT_API_URL', 'PLAYWRIGHT_ROUTE_COVERAGE_PROOF',
    'DATA_REGRESSION_START_COMMIT', 'DATA_REGRESSION_MIGRATION_FROM', 'DATA_REGRESSION_MIGRATION_TO',
    'PLAYWRIGHT_ROUTE_LEDGER_JSON',
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;
  let fetches = 0;
  try {
    Object.assign(process.env, {
      PLAYWRIGHT_ROUTE_QUERY_EVIDENCE: '1',
      PLAYWRIGHT_API_URL: 'http://localhost:8788/api',
      PLAYWRIGHT_ROUTE_COVERAGE_PROOF: proofPath,
      DATA_REGRESSION_START_COMMIT: 'a'.repeat(40),
      DATA_REGRESSION_MIGRATION_FROM: 'none',
      DATA_REGRESSION_MIGRATION_TO: 'none',
      PLAYWRIGHT_ROUTE_LEDGER_JSON: JSON.stringify([{ name: '0000_initial_schema.sql', sha256: 'b'.repeat(64) }]),
    });
    globalThis.fetch = async (url) => {
      fetches += 1;
      assert.equal(url, `http://localhost:8788${ROUTE_QUERY_SNAPSHOT_PATH}`);
      return Response.json({ sourceDigest: 'c'.repeat(64), outcomes: [{ id: `query:${'d'.repeat(24)}`, outcome: 'success' }] });
    };
    const reporter = new RouteQueryPlaywrightReporter();
    reporter.onBegin();
    await captureRouteQuerySnapshot();
    await reporter.onEnd({ status: 'failed' });
    assert(!existsSync(path.join(directory, 'route-coverage-fragments')));
    reporter.onBegin();
    await assert.rejects(reporter.onEnd({status:'passed'}), /ENOENT/);
    await captureRouteQuerySnapshot();
    globalThis.fetch = async () => { throw new Error('Server already stopped'); };
    await reporter.onEnd({ status: 'passed' });
    assert.equal(fetches, 2);
    const fragments = path.join(directory, 'route-coverage-fragments');
    assert(existsSync(fragments));
    const evidence = JSON.parse(readFileSync(path.join(fragments, readdirSync(fragments)[0]), 'utf8'));
    assert.deepEqual(evidence.migrationRange, { from: null, to: null });
    assert.deepEqual(evidence.unitOutcomes, [{ id: `query:${'d'.repeat(24)}`, outcome: 'success' }]);
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
