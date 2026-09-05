import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { it, expect } from 'vitest';

const commit = 'a'.repeat(40);
const target = { environment: 'staging', binding: 'DB', databaseName: 'serp-checklists-staging-db', databaseId: 'fcaf4325-5be7-4ead-ab60-45932a04177b' };
function record(overrides = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'report-identity-'));
  const input = { environment: 'staging', binding: 'DB', commit, tree: 'b'.repeat(40), 'database-name': target.databaseName, 'database-id': target.databaseId, 'migration-from': 'none', 'migration-to': 'none', outcome: 'success', 'raw-output': path.join(dir, 'raw.txt'), 'report-dir': dir, ...overrides };
  writeFileSync(input['raw-output'], 'Synthetic successful deployment');
  const result = spawnSync(process.execPath, ['scripts/data/record-deployment.mjs', ...Object.entries(input).filter(([,v]) => v !== undefined).flatMap(([k,v]) => [`--${k}`,v])]);
  const reports = Object.fromEntries(['json','junit.xml','txt','md'].map(suffix => [suffix, readFileSync(path.join(dir, `${input.environment}-deploy.${suffix}`), 'utf8')]));
  rmSync(dir, { recursive: true, force: true });
  return { result, reports };
}
it.each(['binding','migration-from','migration-to','commit','database-name','database-id'])('deployment recording cannot pass without %s', field => {
  const {result,reports} = record({[field]:undefined});
  expect(result.status).toBe(1);
  expect(JSON.parse(reports.json).verdict).toBe('fail');
});
it.each([
  {'binding':'OTHER'}, {'database-id':'b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1'},
  {'migration-from':'none','migration-to':'0024_safe_template_evolution.sql'},
  {'migration-from':'9999_unknown.sql','migration-to':'9999_unknown.sql'},
])('rejects unknown or mismatched deployment identity and range %j', overrides => {
  const {result,reports}=record(overrides);
  expect(result.status).toBe(1); expect(JSON.parse(reports.json).verdict).toBe('fail');
});
it('records complete application-only identity in every output format', () => {
  const {result,reports} = record();
  expect(result.status).toBe(0);
  expect(JSON.parse(reports.json)).toMatchObject({verdict:'pass',commit,target,migrationRange:{from:null,to:null}});
  for (const format of ['junit.xml','txt','md']) for (const value of [commit,'staging','DB',target.databaseName,target.databaseId,'none']) expect(reports[format]).toContain(value);
});
it.each(['staging','production'])('executes the actual %s workflow recording invocation with reviewed evidence', environment => {
  const directory = mkdtempSync(path.join(tmpdir(),'workflow-record-'));
  const database = environment === 'staging' ? target : {environment,binding:'DB',databaseName:'serp-checklists-db',databaseId:'b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1'};
  const workflow = readFileSync(new URL('../../.github/workflows/cloudflare-pages-deploy.yml',import.meta.url),'utf8');
  const command = workflow.split('\n').find(line => line.includes('run: node scripts/data/record-deployment.mjs') && line.includes(`--environment ${environment}`)).trim().replace(/^run: /,'').replace('node scripts/data/record-deployment.mjs',`"${process.execPath}" "${new URL('./record-deployment.mjs',import.meta.url).pathname}"`).replace(/\$\{\{[^}]+\}\}/g,'success').replace("$(git rev-parse 'HEAD^{tree}')",'b'.repeat(40));
  try {
    mkdirSync(path.join(directory,'tmp/staging-evidence/data'),{recursive:true});
    mkdirSync(path.join(directory,'tmp/data-reports/staging-deploy'),{recursive:true});
    writeFileSync(path.join(directory,'tmp/data-reports/staging-deploy/deploy-output.txt'),'synthetic success');
    writeFileSync(path.join(directory,'tmp/production-deploy.txt'),'synthetic success');
    const evidencePath=path.join(directory,environment==='staging'?'tmp/staging-evidence/data/staging-reviewed-range.json':'tmp/production-request.json');
    const evidence={verdict:'pass',commit,migrationRange:{from:null,to:null},...(environment==='staging'?{target:database}:{database:{databaseName:database.databaseName,databaseId:database.databaseId}})};
    writeFileSync(evidencePath,JSON.stringify(evidence));
    const run = () => spawnSync('/bin/bash',['-e','-o','pipefail','-c',command],{cwd:directory,env:{...process.env,GITHUB_SHA:commit},encoding:'utf8'});
    expect(run().status).toBe(0);
    const reportFile=path.join(directory,`tmp/data-reports/${environment}-deploy/${environment}-deploy.json`);
    expect(JSON.parse(readFileSync(reportFile))).toMatchObject({verdict:'pass',target:database,migrationRange:{from:null,to:null}});
    for (const mutate of [value=>{value.commit='c'.repeat(40);},value=>{delete value.migrationRange.from;},value=>{(value.target??value.database).databaseId='bad';}]) {
      const bad=structuredClone(evidence);mutate(bad);writeFileSync(evidencePath,JSON.stringify(bad));
      expect(run().status).toBe(1);
      expect(JSON.parse(readFileSync(reportFile)).verdict).toBe('fail');
    }
  } finally {rmSync(directory,{recursive:true,force:true});}
});
