import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const commit = "a".repeat(40);
const tree = "b".repeat(40);
const databaseName = "serp-checklists-staging-db";
const databaseId = "fcaf4325-5be7-4ead-ab60-45932a04177b";
const schemaMigrations = readdirSync(new URL('../../db/migrations/', import.meta.url)).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort();

function runFinalizer({ mutate = () => {}, rawFiles = {}, missingData = false, publicationFailure = false } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "staging-finalizer-"));
  const reports = {
    data: { verdict: "pass", commit, teardown: { verdict: "pass", leakedUsers: 0, leakedTemplates: 0, leakedRuns: 0 } },
    range: { verdict: "pass", commit, baseCommit: "c".repeat(40), target: { environment: "staging", databaseName, databaseId }, migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" }, pendingMigrations: ["0024_safe_template_evolution.sql"] },
    schema: { verdict: "pass", commit, target: { environment: "staging", binding: "DB", databaseName, databaseId }, migrationRange: {from:schemaMigrations[0],to:schemaMigrations.at(-1)}, ledger: { verdict: "pass" } },
    invariants: { verdict: "pass", commit, comparisonKind: "migration", target: { environment: "staging", binding: "DB", databaseName, databaseId }, migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" }, ledger: { verdict: "pass", before: ["0023_add_sitemap_revision_state.sql"], after: ["0023_add_sitemap_revision_state.sql", "0024_safe_template_evolution.sql"] } },
    deploy: { verdict: "pass", commit, tree, target: { environment: "staging", databaseName, databaseId } },
    smoke: { verdict: "pass", commit, target: { environment: "staging", databaseName, databaseId }, failures: [], controlledCanaryMutationApproved: true, canaryEvidenceDigest: "a".repeat(64), checks: ["template_canary_designated", "template_write", "template_write_readback", "template_restore", "run_canary_designated", "run_write", "run_write_readback", "run_restore"].map((name) => ({ name, verdict: "pass" })) },
  };
  reports.range.coverage = { planId: "safe-template-evolution-0024", artifactSha256: { "db/migrations/0024_safe_template_evolution.sql": "a".repeat(64) } };
  reports.data.coverage = { ...reports.range.coverage, verdict: "pass" };
  reports.data.migrationRange = structuredClone(reports.range.migrationRange);
  for (const name of ['range','deploy','smoke']) {
    reports[name].target.binding = 'DB';
    reports[name].migrationRange = structuredClone(reports.range.migrationRange);
  }
  mutate(reports);
  const args = [];
  for (const [name, value] of Object.entries(reports)) {
    const file = path.join(directory, name === 'data' && missingData ? 'PRIVATE_CUSTOMER_EMAIL@example.com.json' : `${name}.json`);
    if (!(name === 'data' && missingData)) writeFileSync(file, Object.hasOwn(rawFiles, name) ? (typeof rawFiles[name] === 'function' ? rawFiles[name](JSON.stringify(value)) : rawFiles[name]) : JSON.stringify(value));
    args.push(`--${name}`, file);
  }
  const output = path.join(directory, "output", "staging-promotion.json");
  const nodeArgs = [];
  if (publicationFailure) {
    const preload = path.join(directory, 'publication-fault.mjs');
    writeFileSync(preload, `import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
const write = fs.writeFileSync;
fs.writeFileSync = function(file, ...rest) { if (String(file).endsWith('staging-promotion.md')) throw new Error('PRIVATE_PATH_SENTINEL_128'); return write.call(this, file, ...rest); }; syncBuiltinESMExports();`);
    nodeArgs.push('--import', preload);
  }
  const result = spawnSync(process.execPath, [
    ...nodeArgs,
    fileURLToPath(new URL("./finalize-staging-promotion.mjs", import.meta.url)),
    ...args, "--commit", commit, "--tree", tree, "--database-name", databaseName,
    "--database-id", databaseId, "--binding", "DB", "--output", output,
  ]);
  return { directory, output, result };
}

describe("staging promotion finalizer", () => {
  it('contains partial success publication failures and removes every PASS artifact', () => {
    const run = runFinalizer({ publicationFailure: true });
    try {
      expect(run.result.status).toBe(1);
      expect(String(run.result.stderr)).toContain('data-reporting CANARY_STAGE_FAILED');
      expect(String(run.result.stdout) + String(run.result.stderr)).not.toContain('PRIVATE_PATH_SENTINEL_128');
      expect(String(run.result.stderr)).not.toMatch(/\n\s+at /);
      for (const ext of ['json', 'md', 'txt', 'junit.xml']) expect(existsSync(run.output.replace(/\.json$/, `.${ext}`))).toBe(false);
    } finally { rmSync(run.directory, { recursive: true, force: true }); }
  });
  it.each(['1e-9999', '1e9999', '9007199254740993', '0.00000000000000000000000001e-9999', '-0', '0,"foreignKeyViolations":0', '1,"foreignKey\\u0056iolations":0'])('rejects raw FK evidence %s before summarizing it', token => {
    const run = runFinalizer({ rawFiles: { invariants: json => json.replace(/}$/, `,"foreignKeyViolations":${token},"private":"PRIVATE_RAW_EVIDENCE"}`) } });
    try {
      expect(run.result.status).toBe(1);
      expect(JSON.parse(readFileSync(run.output))).toMatchObject({ verdict: 'fail', commit, target: { environment: 'staging', binding: 'DB', databaseName, databaseId }, migrationRange: { from: '0024_safe_template_evolution.sql', to: '0024_safe_template_evolution.sql' } });
      for (const suffix of ['json', 'md', 'txt', 'junit.xml']) expect(readFileSync(run.output.replace(/\.json$/, `.${suffix}`), 'utf8')).not.toContain('PRIVATE_RAW_EVIDENCE');
      expect(String(run.result.stdout) + String(run.result.stderr)).not.toContain('PRIVATE_RAW_EVIDENCE');
    } finally { rmSync(run.directory, { recursive: true, force: true }); }
  });
  it.each(['range', 'data', 'schema', 'invariants', 'deploy', 'smoke'])('guards the first %s artifact read and accepts exact equivalent notation', name => {
    for (const [evidence, passes] of [
      ['"foreignKeyViolations":0.0e+99,"count":1.00e2', true],
      ['"foreignKeyViolations":1e-9999', false],
      ['"verdict":"PRIVATE_RAW_EVIDENCE","ver\\u0064ict":"pass"', false],
      ['"private":"PRIVATE_RAW_EVIDENCE",', false],
    ]) {
      const run = runFinalizer({ rawFiles: { [name]: json => json.replace(/}$/, `,${evidence}}`) } });
      try {
        expect(run.result.status).toBe(passes ? 0 : 1);
        const report = JSON.parse(readFileSync(run.output));
        expect(report.verdict).toBe(passes ? 'pass' : 'fail');
        expect(report.commit).toBe(!passes && name === 'range' ? 'unknown' : commit);
        expect(report.migrationRange).toEqual(!passes && name === 'range' ? { from: 'invalid', to: 'invalid' } : { from: '0024_safe_template_evolution.sql', to: '0024_safe_template_evolution.sql' });
        for (const suffix of ['json', 'md', 'txt', 'junit.xml']) expect(readFileSync(run.output.replace(/\.json$/, `.${suffix}`), 'utf8')).not.toContain('PRIVATE_RAW_EVIDENCE');
        expect(String(run.result.stdout) + String(run.result.stderr)).not.toContain('PRIVATE_RAW_EVIDENCE');
      } finally { rmSync(run.directory, { recursive: true, force: true }); }
    }
  });
  it('redacts missing input paths while retaining validated failure identity', () => {
    const run = runFinalizer({ missingData: true });
    try {
      expect(run.result.status).toBe(1);
      expect(JSON.parse(readFileSync(run.output, 'utf8'))).toMatchObject({
        verdict: 'fail', commit,
        target: { environment: 'staging', binding: 'DB', databaseName, databaseId },
        migrationRange: { from: '0024_safe_template_evolution.sql', to: '0024_safe_template_evolution.sql' },
      });
      for (const suffix of ['json', 'junit.xml', 'txt', 'md']) {
        const text = readFileSync(run.output.replace(/\.json$/, `.${suffix}`), 'utf8');
        expect(text).not.toContain('PRIVATE_CUSTOMER_EMAIL@example.com');
        expect(text).toContain('0024_safe_template_evolution.sql');
      }
      expect(String(run.result.stdout) + String(run.result.stderr)).not.toContain('PRIVATE_CUSTOMER_EMAIL@example.com');
    } finally { rmSync(run.directory, { recursive: true, force: true }); }
  });
  it.each(['malformed','missing','digest'])('reports truthful identity for %s range or canary evidence', failure => {
    const run = runFinalizer({ ...(failure === 'malformed' ? {rawFiles:{range:'PRIVATE_RANGE'}} : {mutate: reports => {
      if (failure === 'missing') delete reports.range.migrationRange;
      else delete reports.smoke.canaryEvidenceDigest;
    }}) });
    try {
      expect(run.result.status).toBe(1);
      const report = JSON.parse(readFileSync(run.output));
      expect(report.migrationRange).toEqual(failure === 'digest' ? {from:'0024_safe_template_evolution.sql',to:'0024_safe_template_evolution.sql'} : {from:'invalid',to:'invalid'});
      for (const suffix of ['json','junit.xml','txt','md']) {
        const text = readFileSync(run.output.replace(/\.json$/, `.${suffix}`),'utf8');
        expect(text).toContain(failure === 'digest' ? '0024_safe_template_evolution.sql' : 'invalid');
        expect(text).not.toContain('PRIVATE_RANGE');
        if (failure === 'digest') for (const value of [commit,'DB',databaseName,databaseId]) expect(text).toContain(value);
      }
    } finally {rmSync(run.directory,{recursive:true,force:true});}
  });
  it.each(['smoke', 'data'])('retains validated named identity when later %s evidence fails', file => {
    const run = runFinalizer({ rawFiles: { [file]: 'PRIVATE_MALFORMED' } });
    try {
      expect(run.result.status).toBe(1);
      expect(JSON.parse(readFileSync(run.output))).toMatchObject({verdict:'fail', commit, target:{environment:'staging',binding:'DB',databaseName,databaseId},migrationRange:{from:'0024_safe_template_evolution.sql',to:'0024_safe_template_evolution.sql'}});
      for (const suffix of ['json','junit.xml','txt','md']) {
        const text = readFileSync(run.output.replace(/\.json$/, `.${suffix}`),'utf8');
        for (const value of [commit,'DB',databaseName,databaseId,'0024_safe_template_evolution.sql']) expect(text).toContain(value);
        expect(text).not.toContain('PRIVATE_MALFORMED');
      }
    } finally { rmSync(run.directory,{recursive:true,force:true}); }
  });
  it("binds passing data, ledger, invariant, deploy, smoke, and teardown evidence to one commit and tree", () => {
    const run = runFinalizer();
    try {
      expect(run.result.status).toBe(0);
      for (const suffix of ['json','junit.xml','txt','md']) {
        const text = readFileSync(run.output.replace(/\.json$/, `.${suffix}`), 'utf8');
        for (const value of ['DB', databaseName, databaseId, commit, '0024_safe_template_evolution.sql']) expect(text).toContain(value);
      }
      expect(JSON.parse(readFileSync(run.output, "utf8"))).toMatchObject({
        verdict: "pass", commit, tree, target: { environment: "staging", databaseName, databaseId },
        teardown: { verdict: "pass" }, smoke: { verdict: "pass" }, deploy: { verdict: "pass" },
      });
    } finally { rmSync(run.directory, { recursive: true, force: true }); }
  });

  it("fails closed on a tree mismatch or failed teardown and still writes JSON JUnit and text", () => {
    const run = runFinalizer({ mutate: (reports) => { reports.deploy.tree = "d".repeat(40); reports.data.teardown.verdict = "fail"; } });
    try {
      expect(run.result.status).toBe(1);
      expect(JSON.parse(readFileSync(run.output, "utf8"))).toMatchObject({ verdict: "fail", commit, tree, failedStage: "finalize-staging-promotion" });
      expect(readFileSync(run.output.replace(/\.json$/, ".junit.xml"), "utf8")).toContain('failures="1"');
      expect(readFileSync(run.output.replace(/\.json$/, ".txt"), "utf8")).toContain(commit);
    } finally { rmSync(run.directory, { recursive: true, force: true }); }
  });

  it("does not retain malformed evidence text in JSON, JUnit, text, markdown, or console", () => {
    const sentinel = "PRIVATE_MA";
    const run = runFinalizer({ rawFiles: { data: sentinel } });
    try {
      expect(run.result.status).toBe(1);
      for (const suffix of ["json", "junit.xml", "txt", "md"]) {
        const output = readFileSync(run.output.replace(/\.json$/, `.${suffix}`), "utf8");
        expect(output).not.toContain(sentinel);
      }
      expect(String(run.result.stdout) + String(run.result.stderr)).not.toContain(sentinel);
    } finally { rmSync(run.directory, { recursive: true, force: true }); }
  });
  it.each([
    ...['range','deploy','smoke'].flatMap(name => [
      [`missing ${name} binding`, reports => { delete reports[name].target.binding; }],
      [`wrong ${name} binding`, reports => { reports[name].target.binding = 'WRONG'; }],
      [`missing ${name} range`, reports => { delete reports[name].migrationRange; }],
      [`wrong ${name} range`, reports => { reports[name].migrationRange = {from:null,to:null}; }],
    ]),
    ...['environment','binding','databaseName','databaseId'].flatMap(field => [
      [`missing schema ${field}`, reports => { delete reports.schema.target[field]; }],
      [`wrong schema ${field}`, reports => { reports.schema.target[field] = 'wrong'; }],
    ]),
    ['missing schema range', reports => { delete reports.schema.migrationRange; }],
    ['wrong schema range', reports => { reports.schema.migrationRange = {from:null,to:null}; }],
    ["wrong invariant commit", (reports) => { reports.invariants.commit = "f".repeat(40); }],
    ["wrong invariant database", (reports) => { reports.invariants.target.databaseId = "11111111-1111-4111-8111-111111111111"; }],
    ["wrong invariant range", (reports) => { reports.invariants.migrationRange.to = "0023_add_sitemap_revision_state.sql"; }],
    ["CI application-only range for pending0024", (reports) => { reports.data.migrationRange = { from: null, to: null }; }],
    ["CI artifact mismatch", (reports) => { reports.data.coverage = { ...reports.data.coverage, artifactSha256: {} }; }],
    ["reordered ledger", (reports) => { reports.invariants.ledger.after = ["0024_safe_template_evolution.sql", "0023_add_sitemap_revision_state.sql"]; }],
    ["missing canary restore", (reports) => { reports.smoke.checks = reports.smoke.checks.filter((check) => check.name !== "run_restore"); }],
  ])("rejects %s", (_name, mutate) => {
    const run = runFinalizer({ mutate });
    try { expect(run.result.status).toBe(1); expect(JSON.parse(readFileSync(run.output, "utf8")).verdict).toBe("fail"); }
    finally { rmSync(run.directory, { recursive: true, force: true }); }
  });
});
