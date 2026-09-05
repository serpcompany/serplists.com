import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { createRouteQueryRuntime, discoverRouteQueryUnitsFromSource, instrumentRouteQuerySource, evaluateRouteQueryUnitCoverage, routeQuerySourceDigest } from './route-query-units-lib.mjs';

for (const dependency of [
  `export function consume(input,key){const get=Reflect.get; return get(input,key);}`,
  `export function consume(input,key){const values=Object.values; return values(input)[0];}`,
  `export function consume(...inputs){return inputs[0][inputs[1]];}`,
  `export function consume(input,key){return input[key];}`,
  `export function consume(input,key){return input.LABEL;} consume=Reflect.get;`,
]) test(`relative imported Env consumers require body and parameter proof: ${dependency}`, async () => {
  const file='functions/__env_call_probe__/entry.ts';
  const modulePath=path.resolve('functions/__env_call_probe__/consumer.ts');
  const source=`import {consume} from './consumer'; export async function handle(context,key,flag) {
    await context.env.DB.exec('SELECT 1'); const bag={primary:consume(context.env,key)};
    if(flag) await bag.primary.exec('SELECT missing_column FROM users');
  }`;
  const read=fs.readFileSync;
  fs.readFileSync=(file,...args)=>String(file)===modulePath ? dependency : read(file,...args);
  syncBuiltinESMExports();
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE users(id TEXT)');
  try {
    const dependencyUrl=`data:text/javascript,${encodeURIComponent(dependency)}`;
    const original=source.replace("'./consumer'",JSON.stringify(dependencyUrl));
    const module=await import(`data:text/javascript,${encodeURIComponent(original)}`);
    const context={env:{DB:{async exec(sql){sqlite.exec(sql);}}}};
    await module.handle(context,'DB',false);
    await assert.rejects(module.handle(context,'DB',true),/no such column: missing_column/);
    for (const api of [discoverRouteQueryUnitsFromSource,instrumentRouteQuerySource]) {
      assert.throws(()=>api(source,file),/Unsupported database/);
    }
  } finally {sqlite.close(); fs.readFileSync=read; syncBuiltinESMExports();}
});

test('a relative imported ordinary Env consumer is audited without changing execution', async () => {
  const dependency=`export function consume(input){return input.LABEL;}`;
  const file='functions/__env_call_probe__/benign.ts';
  const modulePath=path.resolve('functions/__env_call_probe__/consumer.ts');
  const source=`import {consume as readLabel} from './consumer'; export async function handle(context) {
    await context.env.DB.exec('SELECT 1'); return readLabel(context.env);
  }`;
  const read=fs.readFileSync;
  fs.readFileSync=(file,...args)=>String(file)===modulePath ? dependency : read(file,...args);
  syncBuiltinESMExports();
  const sqlite=new DatabaseSync(':memory:');
  const runtime=createRouteQueryRuntime();
  globalThis.__SERPLISTS_D1_COVERAGE__=runtime;
  try {
    const transformed=instrumentRouteQuerySource(source,file);
    assert.equal(discoverRouteQueryUnitsFromSource(source,file).length,1);
    const dependencyUrl=`data:text/javascript,${encodeURIComponent(dependency)}`;
    const code=transformed.code.replace(/(['"])\.\/consumer\1/,JSON.stringify(dependencyUrl));
    const module=await import(`data:text/javascript,${encodeURIComponent(code)}`);
    assert.equal(await module.handle({env:{LABEL:'healthy',DB:{async exec(sql){sqlite.exec(sql);}}}}),'healthy');
    assert.equal(evaluateRouteQueryUnitCoverage(transformed.units,runtime.snapshot().outcomes).verdict,'pass');
  } finally {sqlite.close(); delete globalThis.__SERPLISTS_D1_COVERAGE__; fs.readFileSync=read; syncBuiltinESMExports();}
});

test('imported D1 execution outside the instrumented Functions tree rejects instead of hiding a query', async () => {
  const dependency=`export async function consume(input,flag){if(flag) await input.DB.exec('SELECT missing_column FROM users');}`;
  const modulePath=path.resolve('src/__env_call_probe__/consumer.ts');
  const source=`import {consume} from '../../src/__env_call_probe__/consumer';
    export async function handle(context,flag){await context.env.DB.exec('SELECT 1'); await consume(context.env,flag);}`;
  const read=fs.readFileSync;
  fs.readFileSync=(file,...args)=>String(file)===modulePath ? dependency : read(file,...args);
  syncBuiltinESMExports();
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE users(id TEXT)');
  try {
    const raw=source.replace("'../../src/__env_call_probe__/consumer'",JSON.stringify(`data:text/javascript,${encodeURIComponent(dependency)}`));
    const module=await import(`data:text/javascript,${encodeURIComponent(raw)}`);
    const context={env:{DB:{async exec(sql){sqlite.exec(sql);}}}};
    await module.handle(context,false);
    await assert.rejects(module.handle(context,true),/no such column: missing_column/);
    for (const api of [discoverRouteQueryUnitsFromSource,instrumentRouteQuerySource]) {
      assert.throws(()=>api(source,'functions/__env_call_probe__/entry.ts'),/Unsupported database/);
    }
  } finally {sqlite.close(); fs.readFileSync=read; syncBuiltinESMExports();}
});

for (const variant of ['mutated default','caller override']) test(`dependency-default consumer proof rejects ${variant}`, async () => {
  const file='functions/api/handlers/clipy.ts';
  const dependency=`export async function audited(request,env){return env.LABEL;}`;
  const source=`import {audited} from './__audited_env_probe__';
    export async function handleGenerateTemplateFromClipy(request,env,dependencies={}) {
      await env.DB.exec('SELECT 1');
      ${variant==='mutated default' ? 'dependencies.getUserId=request.override;' : ''}
      const candidate=await (dependencies.getUserId ?? audited)(request,env);
      if(request.flag) await candidate.exec('SELECT missing_column FROM users');
    }`;
  const overlays=new Map([
    [path.resolve(file),source],
    [path.resolve('functions/api/handlers/__audited_env_probe__.ts'),dependency],
  ]);
  if (variant==='caller override') overlays.set(path.resolve('functions/api/[[route]].ts'),
    `import {handleGenerateTemplateFromClipy} from './handlers/clipy';
      export function route(request,env){return handleGenerateTemplateFromClipy(request,env,{getUserId:(request,value)=>value.DB});}`);
  const read=fs.readFileSync;
  fs.readFileSync=(file,...args)=>overlays.has(String(file)) ? overlays.get(String(file)) : read(file,...args);
  syncBuiltinESMExports();
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE users(id TEXT)');
  try {
    const raw=source.replace("'./__audited_env_probe__'",JSON.stringify(`data:text/javascript,${encodeURIComponent(dependency)}`));
    const module=await import(`data:text/javascript,${encodeURIComponent(raw)}`);
    const env={DB:{async exec(sql){sqlite.exec(sql);}}};
    const override=variant==='caller override' ? {getUserId:(request,value)=>value.DB} : undefined;
    await module.handleGenerateTemplateFromClipy({flag:false,override:(request,value)=>value.DB},env,override);
    await assert.rejects(module.handleGenerateTemplateFromClipy({flag:true,override:(request,value)=>value.DB},env,override),/no such column: missing_column/);
    for (const api of [discoverRouteQueryUnitsFromSource,instrumentRouteQuerySource]) {
      assert.throws(()=>api(source,file),/Unsupported database environment call/);
    }
  } finally {sqlite.close(); fs.readFileSync=read; syncBuiltinESMExports();}
});

test('benign literal containers, aliases and property updates remain ordinary data', async () => {
  for (const body of [
    `const container={nested:[labels]}; return container.nested[0][key];`,
    `const container=[null,{renamed:labels}]; const alias=container; return alias[1].renamed[key];`,
    `const container={}; container.slot=labels; return container.slot[key];`,
  ]) {
    const source=`export async function handle(context,key) {
      await context.env.DB.exec('SELECT 1'); const {labels}={labels:{title:'healthy'}}; ${body}
    }`;
    const file='functions/benign-containers.ts';
    const transformed=instrumentRouteQuerySource(source,file);
    assert.equal(discoverRouteQueryUnitsFromSource(source,file).length,1);
    const sqlite=new DatabaseSync(':memory:');
    const runtime=createRouteQueryRuntime();
    globalThis.__SERPLISTS_D1_COVERAGE__=runtime;
    try {
      const module=await import(`data:text/javascript,${encodeURIComponent(transformed.code)}`);
      assert.equal(await module.handle({env:{DB:{async exec(sql) {sqlite.exec(sql);}}}},'title'),'healthy');
      assert.equal(evaluateRouteQueryUnitCoverage(transformed.units,runtime.snapshot().outcomes).verdict,'pass');
    } finally {sqlite.close(); delete globalThis.__SERPLISTS_D1_COVERAGE__;}
  }
});

for (const [construction, access] of [
  ['const container={bindings};', 'container.bindings'],
  ['const container=[bindings];', 'container[0]'],
]) test(`environment wrapping cannot hide conditional SQLite failure: ${construction}`, async () => {
  const source = `export async function handle(context,key,flag) {
    await context.env.DB.exec('SELECT 1'); const {env:bindings}=context;
    ${construction} const bag={primary:${access}[key]};
    if(flag) await bag.primary.exec('SELECT missing_column FROM users');
  }`;
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE users(id TEXT)');
  try {
    const context={env:{DB:{async exec(sql) {sqlite.exec(sql);}}}};
    const module=await import(`data:text/javascript,${encodeURIComponent(source)}`);
    await module.handle(context,'DB',false);
    await assert.rejects(module.handle(context,'DB',true), /no such column: missing_column/);
    for (const api of [discoverRouteQueryUnitsFromSource,instrumentRouteQuerySource]) {
      assert.throws(() => api(source,'functions/env-container.ts'), /Unsupported database/,
        'reject the Env transfer before wrappers can turn skipped-query coverage into PASS');
    }
  } finally {sqlite.close();}
});

for (const [construction, access] of [
  ['const container={outer:{arbitraryName:bindings}};', 'container.outer.arbitraryName'],
  ['const container=[null,{deep:[null,bindings]}];', 'container[1].deep[1]'],
  ['const first=bindings; const second=first; const container={other:second};', 'container.other'],
  ['const container={other:bindings}; const {other:renamed}=container;', 'renamed'],
  ['const container={}; container.changed=bindings;', 'container.changed'],
  ['const container=[]; container[3]=bindings;', 'container[3]'],
  ['function getBindings(){return bindings;} const container=getBindings();', 'container'],
  ['const getBindings=()=>bindings; const container=getBindings();', 'container'],
  ['function forward(value){return value;} const container=forward(bindings);', 'container'],
  ['function forward(value){return {renamed:value};} const container=forward(bindings);', 'container.renamed'],
  ['function forward({env:renamed}){return renamed;} const container=forward({env:bindings});', 'container'],
  ['function forward(value){return value;} const alias=forward; const container=alias(bindings);', 'container'],
  ['const forward=(value)=>value; const container=forward(bindings);', 'container'],
  ['const {env:{...nested}}=context; const container={different:nested};', 'container.different'],
  ['const container={field:(flag?bindings:bindings)};', 'container.field'],
  ['class Box { field=bindings; } const container=new Box();', 'container.field'],
  ['const helper={forward(value){return value}}; const container=helper.forward(bindings);', 'container'],
  ['const container=((value)=>value)(bindings);', 'container'],
  ['const get=Reflect.get; const container={DB:get(bindings,key)};', 'container'],
  ['const values=Object.values; const container={DB:values(bindings)[0]};', 'container'],
  ['function forward(...values){return values[0];} const container=forward(bindings);', 'container'],
  ['function forward(value){return value.LABEL;} forward=Reflect.get; const container={DB:forward(bindings,key)};', 'container'],
  ['function forward(first,...values){return values[0];} const container=forward(null,bindings);', 'container'],
  ['function forward(value={}){return value;} const container=forward(bindings);', 'container'],
  ['function choose(){return value=>value;} const forward=choose(); const container=forward(bindings);', 'container'],
]) test(`Env transfer rejects independent of wrapper names or positions: ${construction}`, async () => {
  const source = `export async function handle(context,key,flag) {
    await context.env.DB.exec('SELECT 1'); const {env:bindings}=context;
    ${construction} const bag={primary:${access}[key]};
    if(flag) await bag.primary.exec('SELECT missing_column FROM users');
  }`;
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE users(id TEXT)');
  try {
    const context={env:{DB:{async exec(sql) {sqlite.exec(sql);}}}};
    const module=await import(`data:text/javascript,${encodeURIComponent(source)}`);
    await module.handle(context,'DB',false);
    await assert.rejects(module.handle(context,'DB',true), /no such column: missing_column/);
    for (const api of [discoverRouteQueryUnitsFromSource,instrumentRouteQuerySource]) {
      assert.throws(() => api(source,'functions/env-transfer.ts'), /Unsupported database/);
    }
  } finally {sqlite.close();}
});

test('destructured environment cannot hide an unresolved binding inside an object', async () => {
  const file = 'functions/destructured-environment.ts';
  const baseline = `export async function handle(context, key, flag) { await context.env.DB.exec('SELECT 1'); }`;
  const source = baseline.replace(' }', `
    const {env: bindings}=context;
    const bag={primary:bindings[key]};
    if(flag) await bag.primary.exec('SELECT missing_column FROM users');
  }`);
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE users(id TEXT)');
  const runtime = createRouteQueryRuntime();
  globalThis.__SERPLISTS_D1_COVERAGE__ = runtime;
  try {
    const context = {env:{DB:{async exec(sql) {sqlite.exec(sql);}}}};
    const healthy = instrumentRouteQuerySource(baseline, file);
    const healthyModule = await import(`data:text/javascript,${encodeURIComponent(healthy.code)}`);
    await healthyModule.handle(context, 'DB', false);
    assert.equal(evaluateRouteQueryUnitCoverage(healthy.units, runtime.snapshot().outcomes).verdict, 'pass');
    const original = await import(`data:text/javascript,${encodeURIComponent(source)}`);
    await original.handle(context, 'DB', false);
    await assert.rejects(original.handle(context, 'DB', true), /no such column: missing_column/);
    for (const api of [discoverRouteQueryUnitsFromSource, instrumentRouteQuerySource]) {
      assert.throws(() => api(source, file), /Unsupported database computed binding/,
        'false-branch coverage must reject the source before accepting only the healthy unit');
    }
  } finally {sqlite.close(); delete globalThis.__SERPLISTS_D1_COVERAGE__;}
});

for (const [name, parameters, declaration, receiver] of [
  ['object', '', 'const {env:bindings}=context;', 'bindings'],
  ['parameter', ', {env:bindings}=context', '', 'bindings'],
  ['nested parameter', ', {wrapper:{env:bindings}}={wrapper:context}', '', 'bindings'],
  ['nested object', '', 'const {wrapper:{env:bindings}}={wrapper:context};', 'bindings'],
  ['present value with default', '', 'const {env:bindings={}}=context;', 'bindings'],
  ['selected default', '', 'const {absent:bindings=context.env}=context;', 'bindings'],
  ['nested default', '', 'const {absent:{env:bindings}=context}={};', 'bindings'],
  ['computed property', '', "const property='en'+'v'; const {[property]:bindings}=context;", 'bindings'],
  ['array', '', 'const [bindings]=[context.env];', 'bindings'],
  ['rest', '', 'const {...bindings}=context.env;', 'bindings'],
  ['lexical aliases', '', 'const {env:bindings}=context; const first=bindings; const second=first;', 'second'],
  ['shadowed outer value', '', 'const bindings={}; { const {env:bindings}=context; const alias=bindings;', 'alias'],
]) test(`destructured ${name}: unknown escape rejects and static access retains SQLite missingness`, async () => {
  const closeScope = name === 'shadowed outer value' ? '}' : '';
  const prefix = `export async function handle(context, key, flag${parameters}) {
    await context.env.DB.exec('SELECT 1'); ${declaration}`;
  const unknown = `${prefix} const bag={primary:${receiver}[key]};
    if(flag) await bag.primary.exec('SELECT missing_column FROM users'); ${closeScope} }`;
  const supported = `${prefix} if(flag) await ${receiver}['D'+'B'].exec('SELECT missing_column FROM users'); ${closeScope} }`;
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE users(id TEXT)');
  const runtime = createRouteQueryRuntime();
  globalThis.__SERPLISTS_D1_COVERAGE__ = runtime;
  try {
    const context = {env:{DB:{async exec(sql) {sqlite.exec(sql);}}}};
    const original = await import(`data:text/javascript,${encodeURIComponent(unknown)}`);
    await original.handle(context, 'DB', false);
    await assert.rejects(original.handle(context, 'DB', true), /no such column: missing_column/);
    for (const api of [discoverRouteQueryUnitsFromSource, instrumentRouteQuerySource]) {
      assert.throws(() => api(unknown, 'functions/destructuring.ts'), /Unsupported database computed binding/);
    }
    const transformed = instrumentRouteQuerySource(supported, 'functions/destructuring.ts');
    assert.equal(discoverRouteQueryUnitsFromSource(supported, 'functions/destructuring.ts').length, 2);
    const module = await import(`data:text/javascript,${encodeURIComponent(transformed.code)}`);
    await module.handle(context, 'DB', false);
    const evidence = evaluateRouteQueryUnitCoverage(transformed.units, runtime.snapshot().outcomes);
    assert.equal(evidence.verdict, 'fail');
    assert.equal(evidence.counts.executed, 1);
    assert.equal(evidence.counts.missing, 1);
    await assert.rejects(module.handle(context, 'DB', true), /no such column: missing_column/);
    assert.equal(evaluateRouteQueryUnitCoverage(transformed.units, runtime.snapshot().outcomes).counts.failed, 1);
  } finally {sqlite.close(); delete globalThis.__SERPLISTS_D1_COVERAGE__;}
});

test('ordinary lexical shadows do not inherit destructured environment provenance', () => {
  for (const body of [
    `const {env:bindings}=context; {const bindings={}; const alias=bindings; return alias[key];}`,
    `const {env:bindings}=context; function local(bindings) {return bindings[key];}`,
    `for(const {env:bindings} of []) {} const bindings={}; return bindings[key];`,
  ]) {
    const source = `export async function handle(context,key) {await context.env.DB.exec('SELECT 1'); ${body}}`;
    for (const api of [discoverRouteQueryUnitsFromSource, instrumentRouteQuerySource]) {
      const result = api(source, 'functions/destructured-shadow.ts');
      assert.equal((result.units ?? result).length, 1);
    }
  }
});

test('provably non-D1 destructured values keep ordinary computed lookup behavior', async () => {
  for (const declaration of [
    `const {labels}={labels:{title:'healthy'}};`,
    `const settings={labels:{title:'healthy'}}; const alias=settings; const {labels}=alias;`,
    `const {nested:{labels}}={nested:{labels:{title:'healthy'}}};`,
    `const {labels={title:'healthy'}}={};`,
    `const {nested:{labels}={labels:{title:'healthy'}}}={};`,
    `const [labels]=[{title:'healthy'}];`,
    `const {labels:original}={labels:{title:'healthy'}}; const labels=original;`,
  ]) {
    const source = `export async function handle(context,key) {
      await context.env.DB.exec('SELECT 1'); ${declaration} return labels[key];
    }`;
    const transformed = instrumentRouteQuerySource(source, 'functions/benign-destructuring.ts');
    assert.equal(discoverRouteQueryUnitsFromSource(source, 'functions/benign-destructuring.ts').length, 1);
    const runtime = createRouteQueryRuntime();
    globalThis.__SERPLISTS_D1_COVERAGE__ = runtime;
    try {
      const module = await import(`data:text/javascript,${encodeURIComponent(transformed.code)}`);
      assert.equal(await module.handle({env:{DB:{async exec() {}}}}, 'title'), 'healthy');
      assert.equal(evaluateRouteQueryUnitCoverage(transformed.units, runtime.snapshot().outcomes).verdict, 'pass');
    } finally {delete globalThis.__SERPLISTS_D1_COVERAGE__;}
  }
});

test('a benign-looking destructured default or escaped alias cannot prove supplied data is non-D1', async () => {
  for (const [parameters, declaration] of [
    [', {labels}={labels:{title:"healthy"}}', ''],
    ['', 'const {labels}={labels:{title:"healthy"}}; const alias=labels; context.populate(alias);'],
  ]) {
    const source = `export async function handle(context,key,flag${parameters}) {
      await context.env.DB.exec('SELECT 1'); ${declaration}
      function lookup() {return labels[key];}
      const bag={primary:lookup()}; if(flag) await bag.primary.exec('SELECT missing_column FROM users');
    }`;
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec('CREATE TABLE users(id TEXT)');
    try {
      const db={async exec(sql) {sqlite.exec(sql);}};
      const context={env:{DB:db}, populate(target) {target.DB=db;}};
      const module=await import(`data:text/javascript,${encodeURIComponent(source)}`);
      await module.handle(context, 'DB', false, {labels:{DB:db}});
      await assert.rejects(module.handle(context, 'DB', true, {labels:{DB:db}}), /no such column: missing_column/);
      for (const api of [discoverRouteQueryUnitsFromSource, instrumentRouteQuerySource]) {
        assert.throws(() => api(source, 'functions/escaped-destructuring.ts'), /Unsupported database computed binding/);
      }
    } finally {sqlite.close();}
  }
});

test('static templates and lexical const key aliases retain binding lineage', () => {
  for (const expression of ['env[`DB`]', 'env[`D${suffix}`]', 'env[key]', 'connection']) {
    const source = `export async function handle(env, flag) {
      const suffix='B'; const first='D'+suffix; const key=first;
      const connection=env[key];
      await env.DB.exec('SELECT 1');
      if(flag) await ${expression}.exec('SELECT missing_column FROM users');
    }`;
    assert.equal(instrumentRouteQuerySource(source, 'functions/keys.ts').units.length, 2, expression);
  }
});

test('a loop-local key cannot shadow the D1 key after the loop', () => {
  const source = `export async function handle(env, flag) {
    const key='DB';
    for(const key='OTHER'; false;) {}
    if(flag) await env[key].exec('SELECT missing_column FROM users');
  }`;
  assert.equal(instrumentRouteQuerySource(source, 'functions/key-scope.ts').units.length, 1);
});

test('unsupported dynamic and optional binding accesses reject even in skipped branches', () => {
  for (const body of [
    `if(flag) await env[key].exec('SELECT missing_column FROM users');`,
    `const bindings=env; const alias=bindings; if(flag) await alias[key].exec('SELECT 1');`,
    `const key=getKey(); const handle=env[key]; if(flag) await handle.exec('SELECT 1');`,
    `let key='OTHER'; key='DB'; if(flag) await env[key].exec('SELECT 1');`,
    `if(flag) await env?.['D'+'B'].exec('SELECT 1');`,
    `if(flag) await env['D'+'B']?.exec('SELECT 1');`,
    `if(flag) await env['D'+'B'].exec?.('SELECT 1');`,
    `const {[key]: handle}=env; if(flag) await handle.prepare('SELECT 1').all();`,
    `const key='OTHER'; { if(flag) await env[key].prepare('SELECT 1').all(); const key='DB'; }`,
  ]) {
    const source = `export async function handle(env, flag, key) { await env.DB.exec('SELECT 1'); ${body} }`;
    for (const api of [discoverRouteQueryUnitsFromSource, instrumentRouteQuerySource]) {
      assert.throws(() => api(source, 'functions/unknown.ts'), /Unsupported database/, body);
    }
  }
});

for (const access of ["env['D'+'B']", 'env[`DB`]', 'env[`D${suffix}`]', 'env[key]', 'connection']) test(`computed binding keeps skipped SQLite failure missing: ${access}`, async () => {
  const file = 'functions/computed.ts';
  const baseline = `export async function handle(env, flag) { await env.DB.exec('SELECT 1'); }`;
  const source = baseline.replace(' }', ` const suffix='B'; const key='D'+suffix; const connection=env[key]; if(flag) await ${access}.exec('SELECT missing_column FROM users'); }`);
  const transformed = instrumentRouteQuerySource(source, file);
  assert.notEqual(routeQuerySourceDigest(transformed.units), routeQuerySourceDigest(discoverRouteQueryUnitsFromSource(baseline, file)));
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE users(id TEXT)');
  const runtime = createRouteQueryRuntime();
  globalThis.__SERPLISTS_D1_COVERAGE__ = runtime;
  try {
    const env = { DB: { async exec(sql) { sqlite.exec(sql); } } };
    const module = await import(`data:text/javascript,${encodeURIComponent(transformed.code)}`);
    await module.handle(env, false);
    const coverage = evaluateRouteQueryUnitCoverage(transformed.units, runtime.snapshot().outcomes);
    assert.equal(coverage.verdict, 'fail');
    assert.equal(coverage.counts.executed, 1);
    assert.equal(coverage.counts.missing, 1);
    await assert.rejects(module.handle(env, true), /no such column: missing_column/);
    assert.equal(evaluateRouteQueryUnitCoverage(transformed.units, runtime.snapshot().outcomes).counts.failed, 1);
  } finally { sqlite.close(); delete globalThis.__SERPLISTS_D1_COVERAGE__; }
});

test('computed bindings preserve lazy selected batch lineage and receiver evaluation order', async () => {
  const source = `export async function handle(env, flag) {
    const key='D'+'B';
    const good=env[key].prepare('SELECT 1 AS value');
    const bad=env[key].prepare('SELECT missing_column FROM users');
    return await env[key].batch([flag ? bad : good]);
  }`;
  const transformed = instrumentRouteQuerySource(source, 'functions/computed-batch.ts');
  for (const code of [source, transformed.code]) {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec('CREATE TABLE users(id TEXT)');
    const events = [];
    const runtime = createRouteQueryRuntime();
    globalThis.__SERPLISTS_D1_COVERAGE__ = runtime;
    const db = {
      prepare(sql) { assert.equal(this, db); events.push('construct'); return {sql}; },
      get batch() { events.push('method'); return async function(statements) {
        assert.equal(this, db); events.push('execute');
        return statements.map(statement => sqlite.prepare(statement.sql).all().map(row => ({...row})));
      }; },
    };
    const env = {get DB() { events.push('receiver'); return db; }};
    try {
      const module = await import(`data:text/javascript,${encodeURIComponent(code)}`);
      assert.deepEqual(await module.handle(env, false), [[{value:1}]]);
      assert.deepEqual(events, ['receiver','construct','receiver','construct','receiver','method','execute']);
      if (code === transformed.code) {
        const evidence = evaluateRouteQueryUnitCoverage(transformed.units, runtime.snapshot().outcomes);
        assert.equal(evidence.verdict, 'fail');
        assert.equal(evidence.counts.executed, 2);
        assert.equal(evidence.counts.missing, 1);
      }
      await assert.rejects(module.handle(env, true), /no such column: missing_column/);
    } finally { sqlite.close(); delete globalThis.__SERPLISTS_D1_COVERAGE__; }
  }
});
