import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('issue136: real migrated D1 rejects malformed content without template/run/history/audit changes', async () => {
  const root = process.cwd();
  const require = createRequire(path.join(root, 'package.json'));
  const workerRequire = createRequire(require.resolve('wrangler/package.json'));
  const { build } = workerRequire('esbuild');
  const { Miniflare } = workerRequire('miniflare');
  const built = await build({ stdin: { contents: "import api from './functions/api/[[route]].ts'; export default api;", resolveDir: root, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser', conditions: ['workerd','worker','browser'], external: ['node:*'], target: 'es2022', logLevel: 'silent' });
  const directory = mkdtempSync(path.join(tmpdir(), 'serplists-content-contract-'));
  const databaseId = '11111111-1111-4111-8111-111111111111';
  let mf;
  try {
    const config = path.join(directory, 'wrangler.toml');
    writeFileSync(config, `name="content-contract"\ncompatibility_date="2025-12-01"\n[[d1_databases]]\nbinding="DB"\ndatabase_name="content-contract"\ndatabase_id="${databaseId}"\nmigrations_dir=${JSON.stringify(path.join(root,'db/migrations'))}\n`);
    for (const args of [
      ['d1','migrations','apply','content-contract','--local','--config',config],
      ['d1','execute','content-contract','--local','--config',config,'--file',path.join(root,'scripts/data/sql/route-coverage-fixtures.sql'),'--yes'],
    ]) execFileSync(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),...args],{cwd:directory,env:{PATH:process.env.PATH,CI:'true',WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:path.join(directory,'wrangler.log')},stdio:'pipe'});
    mf = new Miniflare({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2025-12-01',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:databaseId},d1Persist:path.join(directory,'.wrangler/state/v3/d1'),bindings:{BETTER_AUTH_SECRET:'issue136-local-secret-at-least-32-characters',FRONTEND_URL:'http://localhost'}});
    const db = await mf.getD1Database('DB');
    const migrations = readdirSync(path.join(root,'db/migrations')).filter(name=>/^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
    assert.deepEqual((await db.prepare('SELECT name FROM d1_migrations ORDER BY id').all()).results.map(row=>row.name),migrations);
    let cookie = '';
    async function request(route, method, body, status=200) {
      const response = await mf.dispatchFetch(`http://localhost${route}`,{method,headers:{Origin:'http://localhost','Content-Type':'application/json',Cookie:cookie},...(body === undefined ? {} : {body:JSON.stringify(body)})});
      const text = await response.text();
      assert.equal(response.status,status,`${method} ${route}: ${text}`);
      return {response,data:JSON.parse(text)};
    }
    const login = await request('/api/auth/sign-in/email','POST',{email:'coverage-owner@e2e.local',password:'password123'});
    cookie = login.response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
    assert(cookie.includes('session_token'));
    const sections = [{id:'content-section',title:'Section',extra:'preserve',items:[{id:'content-item',title:'Legacy',completed:true,contents:[{id:'content-text',type:'text',value:'Unchanged text',extra:{keep:true}}]}]}];
    const created = (await request('/api/templates','POST',{title:'Content Contract',is_public:true,sections})).data;
    const run = (await request('/api/checklists','POST',{title:'Content Run',sections})).data;
    const completionSections = [{id:'completion-section',title:'Section',completed:true,isCompleted:true,extension:{completed:true,isCompleted:true},items:[
      {id:'legacy-item',title:'Legacy',completed:true,contents:[{id:'legacy-content',type:'subItems',value:'',subItems:[{id:'legacy-sub',title:'Legacy sub',completed:true,extension:{completed:true}}]}]},
      {id:'canonical-item',title:'Canonical',isCompleted:true,contents:[{id:'canonical-content',type:'subItems',value:'',subItems:[{id:'canonical-sub',title:'Canonical sub',isCompleted:true}]}]},
      {id:'conflicting-item',title:'Conflicting',completed:true,isCompleted:false,subItems:[{id:'direct-sub',title:'Direct sub',completed:true}],contents:[{id:'conflicting-content',type:'subItems',value:'',completed:true,isCompleted:true,subItems:[{id:'conflicting-sub',title:'Conflicting sub',completed:true,isCompleted:false}]}]},
    ]}];
    const completionTemplate = (await request('/api/templates','POST',{title:'Completion source',sections:completionSections})).data;
    const frozen = (await request('/api/checklists','POST',{title:'Existing frozen run',sections:completionSections,status:'completed'})).data;
    const sourceBefore = await db.prepare('SELECT * FROM templates WHERE id = ?').bind(completionTemplate.id).first();
    const frozenBefore = await db.prepare('SELECT * FROM checklist_runs WHERE id = ?').bind(frozen.id).first();
    const fresh = (await request('/api/checklists','POST',{template_id:completionTemplate.id,title:'Fresh completion run'})).data;
    const freshItems = JSON.parse((await db.prepare('SELECT items FROM checklist_runs WHERE id = ?').bind(fresh.id).first()).items);
    const expected = [{...completionSections[0],items:[
      {...completionSections[0].items[0],completed:false,contents:[{...completionSections[0].items[0].contents[0],subItems:[{id:'legacy-sub',title:'Legacy sub',completed:false,extension:{completed:true}}]}]},
      {...completionSections[0].items[1],isCompleted:false,contents:[{...completionSections[0].items[1].contents[0],subItems:[{id:'canonical-sub',title:'Canonical sub',isCompleted:false}]}]},
      {...completionSections[0].items[2],completed:false,isCompleted:false,subItems:[{id:'direct-sub',title:'Direct sub',completed:false}],contents:[{...completionSections[0].items[2].contents[0],subItems:[{id:'conflicting-sub',title:'Conflicting sub',completed:false,isCompleted:false}]}]},
    ]}];
    assert.deepEqual(freshItems,expected,'fresh template runs reset recognized canonical and legacy completion only');
    const sharedFresh = (await request(`/api/checklists/${completionTemplate.id}/share`,'POST',{})).data;
    const sharedFreshItems = JSON.parse((await db.prepare('SELECT items FROM checklist_runs WHERE id = ?').bind(sharedFresh.id).first()).items);
    assert.deepEqual(sharedFreshItems,expected,'a newly created template-based shared run also starts unchecked');
    assert.deepEqual(await db.prepare('SELECT * FROM templates WHERE id = ?').bind(completionTemplate.id).first(),sourceBefore);
    assert.deepEqual(await db.prepare('SELECT * FROM checklist_runs WHERE id = ?').bind(frozen.id).first(),frozenBefore);
    async function snapshot() {
      const result = {};
      for (const table of ['templates','checklist_runs','template_versions','audit_events']) {
        result[table] = (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results;
      }
      return result;
    }
    for (const entry of [null,7,'bad',{title:'Task',contents:[null]},{title:'Task',contents:[{type:'image',value:{url:'https://example.test/x'}}]},{title:'Task',contents:[{type:'other',value:''}]},{title:'Task',contents:[{type:'subItems',subItems:[null]}]}, {title:'Duplicate content',contents:[{id:'duplicate',type:'text',value:'A',extension:'A'},{id:'duplicate',type:'text',value:'B',extension:'B'}]}]) {
      const before = await snapshot();
      await request('/api/templates','POST',{title:'Invalid',sections:[entry]},400);
      await request(`/api/templates/${created.id}`,'PUT',{sections:[entry],expected_version:1},400);
      await request('/api/checklists','POST',{title:'Invalid',sections:[entry]},400);
      await request(`/api/checklists/${run.id}`,'PUT',{sections:[entry],expected_revision:1},400);
      const imported = await request('/api/templates/backup','POST',{templates:[{title:'Invalid import',sections:[entry]}]},400);
      assert.equal(imported.data.details.imported,0);
      assert.equal(imported.data.details.failed.length,1);
      assert.deepEqual(await snapshot(),before);
    }
    for (const ambiguous of [
      [{id:'s',items:[]},{id:'s',items:[]}],
      [{id:'s1',items:[{id:'i'}]},{id:'s2',items:[{id:'i'}]}],
      [{items:[{contents:[{type:'subItems',subItems:[{id:'sub'},{id:'sub'}]}]}]}],
    ]) {
      const before = await snapshot();
      await request('/api/templates','POST',{title:'Ambiguous',sections:ambiguous},400);
      await request(`/api/templates/${created.id}`,'PUT',{sections:ambiguous,expected_version:1},400);
      await request('/api/checklists','POST',{title:'Ambiguous',sections:ambiguous},400);
      await request(`/api/checklists/${run.id}`,'PUT',{sections:ambiguous,expected_revision:1},400);
      assert.deepEqual(await snapshot(),before);
    }
    const saved = await db.prepare('SELECT items FROM templates WHERE id = ?').bind(created.id).first();
    assert.deepEqual(JSON.parse(saved.items),sections);
    const malformed = JSON.stringify([{id:'bad-section',items:[{id:'bad-item',contents:[{type:'text',value:{bad:true}}]}]}]);
    await db.prepare('UPDATE templates SET items = ? WHERE id = ?').bind(malformed,created.id).run();
    const before = await snapshot();
    await request(`/api/templates/${created.id}`,'PUT',{sections,expected_version:1},409);
    await request(`/api/templates/${created.id}/clone`,'POST',{},409);
    await request('/api/checklists','POST',{template_id:created.id,title:'Blocked'},500);
    await request('/api/templates/backup?format=backup','GET',undefined,409);
    const read = (await request(`/api/templates/${created.id}`,'GET')).data;
    assert.equal(read.content_error,'invalid_checklist_content');
    assert.equal(read.sections,undefined);
    assert.equal(read.items,malformed);
    assert.deepEqual(await snapshot(),before);
    const duplicate = JSON.stringify([{id:'s',items:[{id:'i',contents:[{id:'c',type:'text',value:'A',extension:'A'},{id:'c',type:'text',value:'B',extension:'B'}]}]}]);
    await db.prepare('UPDATE templates SET items = ? WHERE id = ?').bind(duplicate,created.id).run();
    const duplicateBefore = await snapshot();
    await request(`/api/templates/${created.id}`,'PUT',{sections,expected_version:1},409);
    assert.deepEqual(await snapshot(),duplicateBefore);
  } finally {
    await mf?.dispose();
    rmSync(directory,{recursive:true,force:true});
  }
});
