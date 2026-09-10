import { recordIntegrationScenario } from './data-regression-report-lib.mjs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {it} from 'vitest';
import {readdirSync} from 'node:fs';
import path from 'node:path';
import {writeDataCheckReports} from './reporting.mjs';
import {captureRepositoryGitState} from './git-subprocess-env.mjs';

function runProof(args, name, databaseName, databaseId) {
  const repoRoot = fileURLToPath(new URL('../..',import.meta.url));
  const sourceState = captureRepositoryGitState({repoRoot});
  const commit = sourceState.commit;
  const evidenceScope = sourceState.paths.length ? 'working-tree-diagnostic' : 'committed-candidate';
  const migrations = readdirSync(path.join(repoRoot,'db/migrations')).filter(name=>/^\d{4}_.+\.sql$/.test(name)).sort();
  let verdict = 'fail';
  try {
    execFileSync(process.execPath,args,{
    cwd:repoRoot,
    env:{PATH:process.env.PATH,CI:'true',WRANGLER_SEND_METRICS:'false',
      ...(process.env.DATA_REPORT_DIR ? {DATA_REPORT_DIR:process.env.DATA_REPORT_DIR} : {}),
      ...(process.env.DATA_REGRESSION_START_COMMIT ? {DATA_REGRESSION_START_COMMIT:process.env.DATA_REGRESSION_START_COMMIT} : {}),
    },
    stdio:['ignore','pipe','pipe'],encoding:'utf8',timeout:90_000,maxBuffer:4*1024*1024,
  });
    verdict = 'pass';
  } finally {
    if (process.env.DATA_REPORT_DIR) {
      const target = {environment:'local',binding:'DB',databaseName,databaseId,synthetic:true};
      const migrationRange = {from:migrations[0],to:migrations.at(-1)};
      writeDataCheckReports({name,reportDirectory:process.env.DATA_REPORT_DIR,
        report:{commit,evidenceScope,dirtyPaths:sourceState.paths,target,migrationRange,verdict,checks:[{name,verdict}]},
        summary:`${verdict.toUpperCase()} ${name}: environment=local binding=DB database=${databaseName} (${databaseId}) commit=${commit} migration=${migrationRange.from}->${migrationRange.to}. Evidence scope=${evidenceScope}. Synthetic fixture proof only.`,
      });
    }
  }
}

it('fails missing mandatory rules without partial template history or audit writes on real D1',()=>{
  runProof(['--test','scripts/data/issue130-rules-contract.node-test.mjs'],'mandatory-rules-write-failure','rules-contract','local:miniflare:11111111-1111-4111-8111-111111111111');
  recordIntegrationScenario('mandatory-rules-atomic-failure-proof');
  },100_000);

it('fails billing persistence faults and recovers webhook retries without duplicate state on real D1',()=>{
  runProof(['scripts/data/run-stripe-write-failure-proof.mjs'],'billing-write-failure-recovery','issue131-stripe-write-failure','local:miniflare:13113113-1131-4131-8131-131131131131');
  recordIntegrationScenario('billing-write-failure-and-retry-proof');
  },100_000);

it('rejects malformed checklist content without changing stored template or run state on migrated real D1',()=>{
  runProof(['--test','scripts/data/issue136-content-contract.node-test.mjs'],'checklist-content-write-safety','content-contract','local:miniflare:11111111-1111-4111-8111-111111111111');
  recordIntegrationScenario('malformed-checklist-content-write-safety');
  },100_000);
