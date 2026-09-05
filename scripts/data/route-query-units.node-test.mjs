import assert from 'node:assert/strict';
import { test } from 'node:test';
import './route-query-computed-binding.node-test.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  createRouteQueryRuntime,
  discoverRouteQueryUnits,
  discoverRouteQueryUnitsFromSource,
  evaluateRouteQueryUnitCoverage,
  instrumentRouteQuerySource,
  routeQuerySourceDigest,
} from './route-query-units-lib.mjs';

test('batch receiver chains cannot collapse distinct conditional prepared origins into one credited leaf', () => {
  const source = `export async function handle(env, flag) {
    const statement = flag ? env.DB.prepare('SELECT missing FROM users') : env.DB.prepare('SELECT 1');
    return await env.DB.batch([statement.bind()]);
  }`;
  assert.throws(() => instrumentRouteQuerySource(source, 'functions/batch-conditional-chain.ts'), /Unsupported database origin/);
});

test('batch instrumentation preserves receiver, method lookup, argument order and lazy construction', async () => {
  const source = `export async function handle(env) {
    return await env.DB['batch']([env.DB.prepare('SELECT 1')]);
  }`;
  const transformed = instrumentRouteQuerySource(source, 'functions/batch-order.ts');
  const execute = async code => {
    const events = [];
    const db = {
      get batch() { events.push('method'); return function(statements) { assert.equal(this, db); events.push('execute'); return Promise.resolve(statements.length); }; },
      prepare() { events.push('construct'); return {then() {throw new Error('eager query');}}; },
    };
    const env = {get DB() {events.push('receiver'); return db;}};
    const module = await import(`data:text/javascript,${encodeURIComponent(code)}`);
    return {result: await module.handle(env), events};
  };
  const runtime = createRouteQueryRuntime();
  globalThis.__SERPLISTS_D1_COVERAGE__ = runtime;
  try {
    const expected = {result:1, events:['receiver','method','receiver','construct','execute']};
    assert.deepEqual(await execute(source), expected);
    assert.deepEqual(await execute(transformed.code), expected);
    assert.equal(evaluateRouteQueryUnitCoverage(transformed.units, runtime.snapshot().outcomes).verdict, 'pass');
  } finally {delete globalThis.__SERPLISTS_D1_COVERAGE__;}
});

for (const body of [
  `if(flag) return await makeDb(env.DB).select().from(users);`,
  `const connection=makeDb(env.DB); if(flag) return await connection.select().from(users);`,
]) {
  test(`aliased imported Drizzle factory retains query origin and actual execution: ${body}`, async () => {
    const preamble = `import { drizzle as makeDb } from 'drizzle-orm/d1'; const users={};`;
    const before = `${preamble} export async function handle(env,flag){}`;
    const source = `${preamble} export async function handle(env,flag){${body}}`;
    const file = 'functions/imported-factory.ts';
    const transformed = instrumentRouteQuerySource(source, file);
    assert.equal(transformed.units.length, 1);
    assert.notEqual(routeQuerySourceDigest(transformed.units), routeQuerySourceDigest(discoverRouteQueryUnitsFromSource(before, file)));
    const runtime = createRouteQueryRuntime();
    const events = [];
    const raw = {};
    globalThis.__factory = database => { assert.equal(database, raw); events.push('factory'); return { select: () => ({ from: () => ({ then(resolve) { events.push('execute'); resolve(['row']); } }) }) }; };
    globalThis.__SERPLISTS_D1_COVERAGE__ = runtime;
    const executable = code => code.replace(/import\s*\{\s*drizzle as makeDb\s*\}\s*from\s*['"]drizzle-orm\/d1['"];?/, 'const makeDb=globalThis.__factory;');
    try {
      const actual = await import(`data:text/javascript,${encodeURIComponent(executable(transformed.code))}`);
      await actual.handle({ DB: raw }, false);
      assert.equal(evaluateRouteQueryUnitCoverage(transformed.units, runtime.snapshot().outcomes).verdict, 'fail');
      events.length = 0;
      assert.deepEqual(await actual.handle({ DB: raw }, true), ['row']);
      assert.deepEqual(events, ['factory', 'execute']);
      assert.equal(evaluateRouteQueryUnitCoverage(transformed.units, runtime.snapshot().outcomes).verdict, 'pass');
      events.length = 0;
      const original = await import(`data:text/javascript,${encodeURIComponent(executable(source))}`);
      assert.deepEqual(await original.handle({ DB: raw }, true), ['row']);
      assert.deepEqual(events, ['factory', 'execute']);
    } finally { delete globalThis.__factory; delete globalThis.__SERPLISTS_D1_COVERAGE__; }
  });
}

for (const aggregate of ['[makeDb(env.DB)]', '{primary:makeDb(env.DB)}']) {
  test(`aliased imported factory output cannot escape through ${aggregate}`, () => {
    const source = `import {drizzle as makeDb} from 'drizzle-orm/d1'; export async function handle(env){const handles=${aggregate};}`;
    assert.throws(() => instrumentRouteQuerySource(source, 'functions/imported-factory.ts'), /Unsupported database handle transfer/);
  });
}

test('an imported factory named db is not confused with a database-handle parameter', () => {
  const source = `import {drizzle as db} from 'drizzle-orm/d1'; export async function handle(env){return await db(env.DB).select().from(users);}`;
  assert.equal(instrumentRouteQuerySource(source, 'functions/factory-name.ts').units.length, 1);
});

for (const transfer of [
  `const handles=[env.DB]; if(flag) await handles[0].prepare('SELECT missing FROM users').all();`,
  `const handles={primary:env.DB}; if(flag) await handles.primary.prepare('SELECT missing FROM users').all();`,
  `function handle(){return env.DB} if(flag) await handle().prepare('SELECT missing FROM users').all();`,
  `if(flag) await (flag?env.DB:env.DB).prepare('SELECT missing FROM users').all();`,
  `const handles=new Map([['primary',env.DB]]); if(flag) await handles.get('primary').prepare('SELECT missing FROM users').all();`,
  `const primary=(env.DB); const handles={primary}; if(flag) await handles.primary.prepare('SELECT missing FROM users').all();`,
  `const [primary]=[env.DB]; if(flag) await primary.prepare('SELECT missing FROM users').all();`,
  `const handles={...env.DB}; if(flag) await handles.prepare('SELECT missing FROM users').all();`,
  `const handles=[await env.DB]; if(flag) await handles[0].prepare('SELECT missing FROM users').all();`,
  `const handle=()=>env.DB; if(flag) await handle().prepare('SELECT missing FROM users').all();`,
  `const handle=()=>createDb(env); if(flag) await handle().prepare('SELECT missing FROM users').all();`,
  `const handle=env.DB||env.DB; if(flag) await handle.prepare('SELECT missing FROM users').all();`,
  `const handles=new Map(); handles.set('primary',env.DB); if(flag) await handles.get('primary').prepare('SELECT missing FROM users').all();`,
  `function hide(value){return value} if(flag) await hide(env.DB).prepare('SELECT missing FROM users').all();`,
  `const handles=[env.DB satisfies D1Database]; if(flag) await handles[0].prepare('SELECT missing FROM users').all();`,
  `function* handles(){yield env.DB;} if(flag) await handles().next().value.prepare('SELECT missing FROM users').all();`,
  `const handles=[<D1Database>env.DB]; if(flag) await handles[0].prepare('SELECT missing FROM users').all();`,
  `const handles=[env.DB<unknown>]; if(flag) await handles[0].prepare('SELECT missing FROM users').all();`,
  `const handles=[...env.DB];`,
  `capture\`handle:\${env.DB}\`;`,
  `env.DB\`SELECT missing FROM users\`;`,
  `function* handles(){yield* env.DB;}`,
  `const holder=class { primary=env.DB; };`,
]) {
  test(`database handle transfer cannot refresh into passing evidence: ${transfer}`, () => {
    const path = 'functions/handle-transfer.ts';
    const before = `export async function handleRequest(env, flag) { await env.DB.prepare('SELECT 1').all(); }`;
    const after = before.replace("await env.DB.prepare", `${transfer} await env.DB.prepare`);
    const original = discoverRouteQueryUnitsFromSource(before, path);
    assert.equal(original.length, 1);
    const previousEvidence = original.map(unit => ({ id: unit.id, outcome: 'success' }));
    assert.equal(evaluateRouteQueryUnitCoverage(original, previousEvidence).verdict, 'pass');
    // Refresh is itself rejected, before a same-digest inventory can be certified.
    assert.throws(() => discoverRouteQueryUnitsFromSource(after, path), /Unsupported database (?:handle|execution)/);
    assert.throws(() => instrumentRouteQuerySource(after, path), /Unsupported database (?:handle|execution)/);
  });
}

for (const body of [
  `let q; if(flag) q=db.select('one'); else q=db.select('two'); return await q;`,
  `let q=db.select('one'); if(flag) q=db.select('two'); return await q;`,
  `let alias; alias=db; return await alias.select('rows');`,
  `if(flag) db.select('unconsumed'); return await db.select('covered');`,
  `const unused=db.select('unconsumed'); return await db.select('covered');`,
  `function unused(db) { return db.select('unconsumed'); } return await db.select('covered');`,
  `function rows(db) { if(flag) return db.select('new'); return db.select('covered'); } return await rows(db);`,
  `function rows(db) { return flag ? db.select('new') : db.select('covered'); } return await rows(db);`,
  `function rows(db) { return flag ? db.select('covered') : []; } return await rows(db);`,
  `function rows(db) { if(flag) return db.select('covered'); } return await rows(db);`,
  `function rows(db) { return db.select('covered'); } if(flag) rows(db); return await rows(db);`,
  `const rows = (flag ? db.select('new') : db.select('covered')); return await rows;`,
  `const rows = flag ? db.select('new') : db.select('covered'); const alias=rows; return await alias;`,
  `const rows = () => flag ? db.select('new') : db.select('covered'); return await rows();`,
]) {
  test(`origin accounting fails closed after inventory refresh: ${body}`, () => {
    const before = `export async function f(db,flag) { return await db.select('covered'); }`;
    assert.equal(discoverRouteQueryUnitsFromSource(before, 'functions/lineage.ts').length, 1);
    assert.throws(() => instrumentRouteQuerySource(`export async function f(db,flag) { ${body} }`, 'functions/lineage.ts'),
      /Unsupported database (?:execution|origin).*functions\/lineage.ts:1/);
  });
}

test('transitive lazy helper and batch-array origins bind consumer IDs', () => {
  for (const source of [
    `function leaf(db) { return db.select('original'); }
     function rows(db) { return leaf(db); }
     export async function f(db) { return await rows(db); }`,
    `export async function f(db) { const statements = [db.insert('original').values('row')]; return await db.batch(statements); }`,
  ]) {
    const discover = (text) => discoverRouteQueryUnitsFromSource(text, 'functions/transitive.ts');
    assert.equal(discover(source).length, source.includes('batch(') ? 2 : 1);
    assert.notEqual(routeQuerySourceDigest(discover(source)), routeQuerySourceDigest(discover(source.replace('original', 'changed'))));
  }
});

test('all current Functions sources still discover and instrument', () => {
  assert(discoverRouteQueryUnits(process.cwd()).length > 0);
  const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
  for (const file of walk(path.join(process.cwd(), 'functions')).filter(file => /\.[cm]?[jt]sx?$/.test(file) && !/\.(?:test|spec)\./.test(file))) {
    instrumentRouteQuerySource(readFileSync(file, 'utf8'), path.relative(process.cwd(), file));
  }
});

test('direct wrapped aliases and tracked local options parameters preserve exactly once execution', async () => {
  const source = `async function read({primary}) { return await primary.prepare('SELECT 1').all(); }
    export async function handle(env) { const primary = (env.DB); return await read({primary}); }`;
  const transformed = instrumentRouteQuerySource(source, 'functions/direct-handles.ts');
  assert.equal(transformed.units.length, 1);
  const execute = async code => {
    const events = [];
    const db = { prepare(sql) { assert.equal(this, db); events.push(sql); return { all: async () => { events.push('all'); return ['row']; } }; } };
    const module = await import(`data:text/javascript,${encodeURIComponent(code)}`);
    return { value: await module.handle({ DB: db }), events };
  };
  const runtime = createRouteQueryRuntime();
  globalThis.__SERPLISTS_D1_COVERAGE__ = runtime;
  try {
    assert.deepEqual(await execute(transformed.code), await execute(source));
    assert.equal(evaluateRouteQueryUnitCoverage(transformed.units, runtime.snapshot().outcomes).verdict, 'pass');
  } finally { delete globalThis.__SERPLISTS_D1_COVERAGE__; }
});

test('transitive named helpers and conditional mapped batch inputs preserve lazy execution', async () => {
  const source = `function leaf(db) { return db.select('rows'); }
    function rows(db) { return leaf(db); }
    export async function f(db, enabled) {
      const statements = [db.insert('base'), ...(enabled ? [db.insert('optional')] : []),
        ...['mapped'].map(value => db.insert(value))];
      await db.batch(statements);
      return await rows(db);
    }`;
  const transformed = instrumentRouteQuerySource(source, 'functions/batch-lineage.ts');
  assert.equal(transformed.units.length, 5);
  const run = async (code) => {
    const events = [];
    const module = await import(`data:text/javascript,${encodeURIComponent(code)}`);
    const result = await module.f({
      insert(value) { events.push(['build', value]); return { value, then() { throw new Error('batch builder executed eagerly'); } }; },
      async batch(statements) { events.push(['batch', statements.map(statement => statement.value)]); },
      select(value) { events.push(['build', value]); return { then(resolve) { events.push(['execute', value]); resolve(value); } }; },
    }, true);
    return { events, result };
  };
  const original = await run(source);
  const runtime = createRouteQueryRuntime();
  globalThis.__SERPLISTS_D1_COVERAGE__ = runtime;
  try {
    assert.deepEqual(await run(transformed.code), original);
    assert.equal(evaluateRouteQueryUnitCoverage(transformed.units, runtime.snapshot().outcomes).verdict, 'pass');
  } finally { delete globalThis.__SERPLISTS_D1_COVERAGE__; }
});

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

for (const expression of [
  `await env.DB.exec('SELECT  two   spaces')`,
  `env.DB.exec('SELECT  two   spaces')`,
  `await db.query.users.findMany({ where: 'two  spaces' })`,
  `await db['query']['users']['findFirst']({ where: 'two  spaces' })`,
  `await db['select']('two  spaces')`,
  `Promise.resolve(db['select']('two  spaces'))`,
]) {
  test(`refreshed discovery rejects an unexecuted branch: ${expression}`, async () => {
    const path = 'functions/branch.ts';
    const before = `export async function handle(env, db, enabled) { return 'ok'; }`;
    const source = before.replace("return 'ok';", `if (enabled) { ${expression}; } return 'ok';`);
    const transformed = instrumentRouteQuerySource(source, path);
    assert.equal(ids(transformed.units, 'query').length, 1);
    assert.notEqual(routeQuerySourceDigest(transformed.units), routeQuerySourceDigest(discoverRouteQueryUnitsFromSource(before, path)));
    assert.notEqual(routeQuerySourceDigest(transformed.units), routeQuerySourceDigest(discoverRouteQueryUnitsFromSource(source.replace('two  ', 'two '), path)));
    const runtime = createRouteQueryRuntime();
    globalThis.__SERPLISTS_D1_COVERAGE__ = runtime;
    try {
      const module = await import(`data:text/javascript,${encodeURIComponent(transformed.code)}`);
      await module.handle({}, {}, false);
      assert.equal(evaluateRouteQueryUnitCoverage(transformed.units, runtime.snapshot().outcomes).verdict, 'fail');
    } finally { delete globalThis.__SERPLISTS_D1_COVERAGE__; }
  });
}

for (const expression of [
  `db.select('rows').then(rows => rows)`,
  `const rows = db.select('rows'); rows.then(rows => rows)`,
  `await db[method]('rows')`,
  `await env.DB['ex' + 'ec']('SELECT 1')`,
  `await db.query.users[method]()`,
  `await db.newExecutionMethod('rows')`,
  `await db.select('rows').newExecutionMethod()`,
  `const execute = env.DB.exec; execute('SELECT 1')`,
  `const { exec } = env.DB; exec('SELECT 1')`,
  `function rows(db) { return db.select('rows'); } const query = rows(db); query.then(x => x)`,
  `const queries = [db.select('rows')]; queries[0].then(x => x)`,
  `const queries = [db.select('rows')]; await Promise.all(queries)`,
  `(enabled ? db.select('one') : db.select('two')).then(x => x)`,
  `const rows = () => db.select('rows'); rows().then(x => x)`,
]) {
  test(`unsupported database execution is explicit even in an unexecuted branch: ${expression}`, () => {
    const source = `export async function handle(env, db, enabled, method) { if (enabled) { ${expression}; } }`;
    assert.throws(() => instrumentRouteQuerySource(source, 'functions/unsupported.ts'), /Unsupported database execution/);
  });
}

test('nested awaits preserve actual evaluation order, lexical receiver, results and exactly once execution', async () => {
  const source = `export async function handle(db, events) {
    return await db.select((events.push('argument'), await db.select('inner')), this.value);
  }`;
  const transformed = instrumentRouteQuerySource(source, 'functions/nested.ts');
  assert.equal(ids(transformed.units, 'query').length, 2);
  const evaluate = async (code) => {
    const events = [];
    const db = { select(...args) {
      assert.equal(this, db);
      events.push(['build', ...args]);
      return { then(resolve) { events.push(['execute', ...args]); resolve(args.join(':')); } };
    } };
    const module = await import(`data:text/javascript,${encodeURIComponent(code)}`);
    const result = await module.handle.call({ value: 'lexical' }, db, events);
    return { result, events };
  };
  const original = await evaluate(source);
  const runtime = createRouteQueryRuntime();
  globalThis.__SERPLISTS_D1_COVERAGE__ = runtime;
  try {
    assert.deepEqual(await evaluate(transformed.code), original);
    assert.equal(evaluateRouteQueryUnitCoverage(transformed.units, runtime.snapshot().outcomes).verdict, 'pass');
    assert.equal(runtime.snapshot().outcomes.length, 2);
  } finally { delete globalThis.__SERPLISTS_D1_COVERAGE__; }
});

test('split aliases bind original SQL literals to their consuming unit digest', () => {
  const source = `export async function handle(env) {
    const { DB: database } = env;
    const statement = database.prepare('SELECT  two   spaces');
    const bound = statement.bind('value');
    return await bound.all();
  }`;
  const discover = (text) => discoverRouteQueryUnitsFromSource(text, 'functions/alias-literal.ts');
  assert.equal(discover(source).length, 1);
  assert.notEqual(routeQuerySourceDigest(discover(source)), routeQuerySourceDigest(discover(source.replace('two   ', 'two '))));
});

test('lazy adapter source literals remain bound to direct and split consumers', () => {
  for (const consumer of ['return await rows(db)', 'const query = rows(db); return await query']) {
    const source = `function rows(db) { return db.select('two  spaces'); }
      export async function handle(db) { ${consumer}; }`;
    const discover = (text) => discoverRouteQueryUnitsFromSource(text, 'functions/adapter-literal.ts');
    assert.equal(discover(source).length, 1);
    assert.notEqual(routeQuerySourceDigest(discover(source)), routeQuerySourceDigest(discover(source.replace('two  ', 'two '))));
  }
});

test('batch builders stay lazy and earn statement coverage only after batch success', async () => {
  const source = `export async function handle(db) {
    return await db.batch([db.insert('table').values('row')]);
  }`;
  const transformed = instrumentRouteQuerySource(source, 'functions/batch.ts');
  assert.equal(transformed.units.length, 2);
  const runtime = createRouteQueryRuntime();
  globalThis.__SERPLISTS_D1_COVERAGE__ = runtime;
  const events = [];
  const statement = { then() { throw new Error('builder executed outside batch'); } };
  try {
    const module = await import(`data:text/javascript,${encodeURIComponent(transformed.code)}`);
    const result = await module.handle({
      insert() { events.push('build'); return { values() { return statement; } }; },
      async batch(statements) { assert.equal(statements[0], statement); events.push('batch'); return 'ok'; },
    });
    assert.equal(result, 'ok');
    assert.deepEqual(events, ['build', 'batch']);
    assert.equal(evaluateRouteQueryUnitCoverage(transformed.units, runtime.snapshot().outcomes).verdict, 'pass');
  } finally { delete globalThis.__SERPLISTS_D1_COVERAGE__; }
});

test('an eager query assigned to a promise alias is counted and executed once', async () => {
  const source = `export async function handle(env) {
    const pending = env.DB.exec('SELECT 1');
    const alias = pending;
    return await alias;
  }`;
  const transformed = instrumentRouteQuerySource(source, 'functions/eager-alias.ts');
  assert.equal(transformed.units.length, 1);
  const runtime = createRouteQueryRuntime();
  globalThis.__SERPLISTS_D1_COVERAGE__ = runtime;
  let executions = 0;
  try {
    const module = await import(`data:text/javascript,${encodeURIComponent(transformed.code)}`);
    assert.equal(await module.handle({ DB: { exec() { executions++; return Promise.resolve('ok'); } } }), 'ok');
    assert.equal(executions, 1);
    assert.equal(evaluateRouteQueryUnitCoverage(transformed.units, runtime.snapshot().outcomes).verdict, 'pass');
  } finally { delete globalThis.__SERPLISTS_D1_COVERAGE__; }
});

test('shadowed builder names keep lexical alias identity', async () => {
  const source = `export async function handle(db) {
    const query = db.select('database');
    { const query = Promise.resolve('ordinary'); await query; }
    return await query;
  }`;
  const transformed = instrumentRouteQuerySource(source, 'functions/shadow.ts');
  assert.equal(transformed.units.length, 1);
  const runtime = createRouteQueryRuntime();
  globalThis.__SERPLISTS_D1_COVERAGE__ = runtime;
  let executions = 0;
  try {
    const module = await import(`data:text/javascript,${encodeURIComponent(transformed.code)}`);
    assert.equal(await module.handle({ select(value) { return { then(resolve) { executions++; resolve(value); } }; } }), 'database');
    assert.equal(executions, 1);
    assert.equal(evaluateRouteQueryUnitCoverage(transformed.units, runtime.snapshot().outcomes).verdict, 'pass');
  } finally { delete globalThis.__SERPLISTS_D1_COVERAGE__; }
});
