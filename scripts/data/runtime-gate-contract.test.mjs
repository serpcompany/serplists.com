import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { browserGateArguments, assertRuntimeRangeBinding, validateFullExportRecoveryProof, assertSourceHandlerProofTap } from './runtime-gate-contract.mjs';
describe('mandatory runtime gate contract', () => {
  it('requires both source-handler controls to execute without skips or failures', () => {
    const tap = 'TAP version 13\nok 1 - synthetic source with malformed retired content produces refusal and unchanged proof alongside healthy writes\nok 2 - explicit no-eligible synthetic source fails without a pass artifact\n1..2\n# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
    expect(assertSourceHandlerProofTap(tap)).toBe(true);
    for (const invalid of ['', tap.replace('ok 2 -', 'not ok 2 -'), tap.replace('# skipped 0', '# skipped 1'), tap.replace('# pass 2', '# pass 1'), tap.replace('explicit no-eligible synthetic source fails without a pass artifact', 'unrelated test')]) {
      expect(() => assertSourceHandlerProofTap(invalid)).toThrow();
    }
  });
  it('rejects stale, absent, broken or incomplete actual full-export recovery evidence', () => {
    const commit = 'a'.repeat(40);
    const report = {commit,verdict:'pass',target:{environment:'local',binding:'DB',databaseName:'serp-checklists-db',databaseId:'local:miniflare:full-export-recovery',synthetic:true},migrationRange:{from:'0000_initial_schema.sql',to:'0024_safe_template_evolution.sql'},teardown:{verdict:'pass',leakedStatePaths:0},restorations:[['original-source','pre0024'],['prepared-target','pre0024'],['original-source','post0024'],['prepared-target','post0024']].map(([kind,sourceBoundary])=>({kind,sourceBoundary,fullStateEquality:true,exportSha256:'b'.repeat(64)}))};
    expect(validateFullExportRecoveryProof(report,commit)).toBe(true);
    for (const invalid of [null,{...report,commit:'c'.repeat(40)},{...report,restorations:report.restorations.slice(1)},{...report,teardown:{verdict:'pass',leakedStatePaths:1}},{...report,restorations:report.restorations.map(row=>({...row,fullStateEquality:false}))}]) expect(validateFullExportRecoveryProof(invalid,commit)).toBe(false);
  });
  it('rejects every CLI selector and override before local setup', () => {
    for (const args of [['--grep', '@smoke'], ['tests/e2e/smoke.spec.ts'], ['--project=x'], ['--config=x'], ['--shard=1/2'], ['--list'], ['--pass-with-no-tests']]) expect(() => browserGateArguments(args)).toThrow('cannot be selected');
    expect(browserGateArguments([])).toEqual({gating:true,args:[]});
    expect(browserGateArguments(['--diagnostic-selection','--grep','x']).gating).toBe(false);
  });
  it('rejects nested selected-range mismatch including absent, null and none boundaries', () => {
    const none = {from:null,to:null};
    const migration = {from:'0024_safe_template_evolution.sql',to:'0024_safe_template_evolution.sql'};
    expect(assertRuntimeRangeBinding({migrationRange:none, scenarioEvidence:[{migrationRange:{from:'none',to:'none'}}]}, none)).toBe(true);
    for (const selected of [none,migration]) {
      const wrong = selected === none ? migration : none;
      expect(() => assertRuntimeRangeBinding({migrationRange:selected, scenarioEvidence:[{query:{migrationRange:wrong}}]},selected)).toThrow('mismatched');
    }
    expect(() => assertRuntimeRangeBinding({},none)).toThrow('missing');
  });
  it('uses one complete serial unit suite and isolated complete browser gate in pre-push', () => {
    const root = new URL('../..',import.meta.url);
    const hooks = readFileSync(new URL('lefthook.yml',root),'utf8').split('pre-push:')[1];
    expect(hooks).toContain('test:data-regressions');
    expect(hooks).not.toMatch(/test:unit|test:smoke|test:e2e/);
    const pkg = JSON.parse(readFileSync(new URL('package.json',root),'utf8'));
    expect(pkg.scripts['test:e2e']).toBe('node scripts/run-playwright-smoke.mjs');
    const suite = readFileSync(new URL('scripts/data/run-data-regression-suite.ts',root),'utf8');
    expect(suite).toContain('"vitest", "run", "--no-file-parallelism"');
    expect(suite).toContain('exports pre0024 and migrated current data, prepares each profile, and restores actual exports');
  });
});
