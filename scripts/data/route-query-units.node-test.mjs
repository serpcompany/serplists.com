import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createRouteQueryRuntime,
  discoverRouteQueryUnitsFromSource,
  evaluateRouteQueryUnitCoverage,
  instrumentRouteQuerySource,
} from './route-query-units-lib.mjs';

const handlerSource = `
export async function handle(request, env) {
  const url = new URL(request.url);
  const part = url.pathname.split('/').at(-1);
  const db = env.db;
  if (request.method === 'GET' && part === 'first') {
    return Response.json(await db.select('first'));
  }
  return new Response('Not Found', { status: 404 });
}`;

function ids(units, kind) {
  return units.filter((unit) => unit.kind === kind).map((unit) => unit.id);
}

test('fresh discovery cannot make a newly added endpoint pass without runtime execution', () => {
  const before = discoverRouteQueryUnitsFromSource(handlerSource, 'functions/api/handlers/example.ts');
  const afterSource = handlerSource.replace(
    "  return new Response('Not Found', { status: 404 });",
    `  if (request.method === 'GET' && part === 'second') {
    return Response.json(await db.select('second'));
  }
  return new Response('Not Found', { status: 404 });`,
  );
  const refreshed = discoverRouteQueryUnitsFromSource(afterSource, 'functions/api/handlers/example.ts');
  const observed = before.map((unit) => ({ id: unit.id, outcome: 'success' }));
  const result = evaluateRouteQueryUnitCoverage(refreshed, observed);

  assert.equal(result.verdict, 'fail');
  assert.equal(refreshed.filter((unit) => unit.kind === 'endpoint').length, 2);
  assert.equal(result.units.filter((unit) => unit.kind === 'endpoint' && unit.status === 'missing').length, 1);
});

test('fresh discovery cannot let an unexecuted query branch reuse its handler evidence', () => {
  const source = handlerSource.replace(
    "return Response.json(await db.select('first'));",
    "return Response.json(await (url.searchParams.has('archived') ? db.select('archived') : db.select('active')));",
  );
  const discovered = discoverRouteQueryUnitsFromSource(source, 'functions/api/handlers/example.ts');
  const queryIds = ids(discovered, 'query');
  assert.equal(queryIds.length, 2, 'conditional branches are separate query execution units');

  const observed = discovered
    .filter((unit) => unit.kind === 'endpoint' || unit.id === queryIds[0])
    .map((unit) => ({ id: unit.id, outcome: 'success' }));
  const result = evaluateRouteQueryUnitCoverage(discovered, observed);

  assert.equal(result.verdict, 'fail');
  assert.deepEqual(result.units.filter((unit) => unit.status === 'missing').map((unit) => unit.id), [queryIds[1]]);
  assert(!JSON.stringify(result).includes('archived'), 'reports contain no query-parameter names or values');
});

test('test-only instrumentation preserves result and executes each lazy query once', async () => {
  let executions = 0;
  const db = {
    select(value) {
      return {
        then(resolve) {
          executions += 1;
          resolve([{ value }]);
        },
      };
    },
  };
  const request = new Request('http://local/api/example/first');
  const originalUrl = `data:text/javascript,${encodeURIComponent(handlerSource)}`;
  const original = await import(originalUrl);
  const originalResult = await original.handle(request, { db });
  assert.deepEqual(await originalResult.json(), [{ value: 'first' }]);
  assert.equal(executions, 1);

  executions = 0;
  const runtime = createRouteQueryRuntime();
  globalThis.__SERPLISTS_D1_COVERAGE__ = runtime;
  try {
    const transformed = instrumentRouteQuerySource(handlerSource, 'functions/api/handlers/example.ts');
    const instrumented = await import(`data:text/javascript,${encodeURIComponent(transformed.code)}#instrumented`);
    const instrumentedResult = await instrumented.handle(request, { db });
    assert.deepEqual(await instrumentedResult.json(), [{ value: 'first' }]);
    assert.equal(executions, 1, 'instrumentation must not eagerly or doubly execute a lazy query');
    const coverage = evaluateRouteQueryUnitCoverage(transformed.units, runtime.snapshot().outcomes);
    assert.equal(coverage.verdict, 'pass');
  } finally {
    delete globalThis.__SERPLISTS_D1_COVERAGE__;
  }
});

test('unmapped runtime calls and failed D1 executions cannot satisfy coverage', () => {
  const discovered = discoverRouteQueryUnitsFromSource(handlerSource, 'functions/api/handlers/example.ts');
  const observed = discovered.map((unit) => ({ id: unit.id, outcome: unit.kind === 'query' ? 'error' : 'success' }));
  observed.push({ id: 'query:not-in-source', outcome: 'success' });
  const result = evaluateRouteQueryUnitCoverage(discovered, observed);

  assert.equal(result.verdict, 'fail');
  assert(result.errors.some((error) => error.code === 'unmapped-runtime-unit'));
  assert(result.units.some((unit) => unit.kind === 'query' && unit.status === 'failed'));
});

test('only an exact current unit with a documented boundary and proof can be excluded', () => {
  const discovered = discoverRouteQueryUnitsFromSource(handlerSource, 'functions/api/handlers/example.ts');
  const omitted = discovered.at(-1);
  const observed = discovered.slice(0, -1).map((unit) => ({ id: unit.id, outcome: 'success' }));
  const precise = evaluateRouteQueryUnitCoverage(discovered, observed, [{
    id: omitted.id,
    boundary: 'package-adapter',
    proof: 'repository query executes at the consuming unit',
  }]);
  assert.equal(precise.verdict, 'pass');
  assert.equal(precise.counts.excluded, 1);

  const stale = evaluateRouteQueryUnitCoverage(discovered, observed, [{
    id: 'query:000000000000000000000000',
    boundary: 'whole handler',
    proof: 'broad exemption',
  }]);
  assert.equal(stale.verdict, 'fail');
  assert(stale.errors.some((error) => error.code === 'stale-exclusion'));
});

test('unit IDs are stable across whitespace and unrelated comments', () => {
  const changedFormatting = `// unrelated\n${handlerSource.replaceAll('  ', '    ')}`;
  const before = discoverRouteQueryUnitsFromSource(handlerSource, 'functions/api/handlers/example.ts');
  const after = discoverRouteQueryUnitsFromSource(changedFormatting, 'functions/api/handlers/example.ts');
  assert.deepEqual(after.map(({ id, kind }) => ({ id, kind })), before.map(({ id, kind }) => ({ id, kind })));
});

test('lazy query-builder adapters are recorded only when their consumer executes', async () => {
  const source = `
    function selectRows(db) { return db.select('adapter'); }
    export async function handle(db, execute) {
      if (!execute) return 'skipped';
      return await selectRows(db);
    }
  `;
  const transformed = instrumentRouteQuerySource(source, 'functions/api/handlers/adapter.ts');
  assert.equal(transformed.units.filter((unit) => unit.kind === 'query').length, 1);
  let executions = 0;
  const db = { select: () => ({ then(resolve) { executions += 1; resolve('executed'); } }) };
  const runtime = createRouteQueryRuntime();
  globalThis.__SERPLISTS_D1_COVERAGE__ = runtime;
  try {
    const module = await import(`data:text/javascript,${encodeURIComponent(transformed.code)}#adapter`);
    assert.equal(await module.handle(db, false), 'skipped');
    assert.equal(executions, 0);
    assert.equal(evaluateRouteQueryUnitCoverage(transformed.units, runtime.snapshot().outcomes).verdict, 'fail');
    assert.equal(await module.handle(db, true), 'executed');
    assert.equal(executions, 1);
    assert.equal(evaluateRouteQueryUnitCoverage(transformed.units, runtime.snapshot().outcomes).verdict, 'pass');
  } finally {
    delete globalThis.__SERPLISTS_D1_COVERAGE__;
  }
});

test('database aliases and split builders remain discoverable through Promise.all consumers', async () => {
  const source = `
    export async function handle(env, drizzleDb, execute) {
      const { DB: database } = env;
      const statement = database.prepare('SELECT  two   spaces');
      const boundStatement = statement.bind('value');
      const renamedDb = drizzleDb;
      const selectedRows = renamedDb.select('split  drizzle');
      if (!execute) return 'skipped';
      return await Promise.all([boundStatement.all(), selectedRows]);
    }
  `;
  const transformed = instrumentRouteQuerySource(source, 'functions/api/handlers/split.ts');
  const queryUnits = transformed.units.filter((unit) => unit.kind === 'query');
  assert.equal(queryUnits.length, 2, 'both D1 and Drizzle split builders are execution units');

  let executions = 0;
  const lazy = (value) => ({ then(resolve) { executions += 1; resolve(value); } });
  const runtime = createRouteQueryRuntime();
  globalThis.__SERPLISTS_D1_COVERAGE__ = runtime;
  try {
    const module = await import(`data:text/javascript,${encodeURIComponent(transformed.code)}#split`);
    const env = { DB: { prepare: () => ({ bind() { return { all: () => lazy('d1') }; } }) } };
    const drizzleDb = { select: () => lazy('drizzle') };
    assert.equal(await module.handle(env, drizzleDb, false), 'skipped');
    assert.equal(executions, 0, 'building queries must stay lazy');
    assert.equal(evaluateRouteQueryUnitCoverage(queryUnits, runtime.snapshot().outcomes).verdict, 'fail');
    assert.deepEqual(await module.handle(env, drizzleDb, true), ['d1', 'drizzle']);
    assert.equal(executions, 2, 'each query executes exactly once');
    assert.equal(evaluateRouteQueryUnitCoverage(queryUnits, runtime.snapshot().outcomes).verdict, 'pass');
  } finally {
    delete globalThis.__SERPLISTS_D1_COVERAGE__;
  }
});

test('query source IDs preserve whitespace inside literals while ignoring formatting trivia', () => {
  const base = `export async function handle(db) { return await db.select('two  spaces'); }`;
  const reformatted = `export async function handle ( db ) {\n  return await db\n    .select( 'two  spaces' );\n}`;
  const changedLiteral = `export async function handle(db) { return await db.select('two spaces'); }`;
  const path = 'functions/api/handlers/literal.ts';
  const originalIds = ids(discoverRouteQueryUnitsFromSource(base, path), 'query');

  assert.deepEqual(ids(discoverRouteQueryUnitsFromSource(reformatted, path), 'query'), originalIds);
  assert.notDeepEqual(ids(discoverRouteQueryUnitsFromSource(changedLiteral, path), 'query'), originalIds);
});

test('unsupported lazy builder handoffs fail closed instead of changing query timing', () => {
  const source = `
    export async function handle(database, executeQuery) {
      const query = database.select('rows');
      return await executeQuery(query);
    }
  `;
  assert.throws(
    () => discoverRouteQueryUnitsFromSource(source, 'functions/api/handlers/unsupported.ts'),
    /Unsupported lazy query builder passed through executeQuery.*unsupported\.ts:4/,
  );
});

test('split builders returned directly from async functions are execution units', () => {
  const source = `
    export async function handle(database) {
      const query = database.select('async return');
      return query;
    }
  `;
  const discovered = discoverRouteQueryUnitsFromSource(source, 'functions/api/handlers/async-return.ts');
  assert.equal(discovered.filter((unit) => unit.kind === 'query').length, 1);
});
