import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { appendGeneratedProvenance, sanitizedGitEnvironment, validateProvenanceState, loadProvenanceState, verifyNewMigrationGeneratedFromBase } from "./migration-provenance-lib.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const reportRoot = path.join(repoRoot, "tmp/data-reports/issue-101");
const env = sanitizedGitEnvironment();
function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "serplists-bootstrap-proof-"));
  // Actual origin/staging when #101 was reproduced. Pin the regression base
  // so this remains a bootstrap test after staging adopts provenance.
  const base = "11a0fc1914b012277c0d0275ad1662f857800c03";
  git(root, ["clone", "--quiet", "--no-local", repoRoot, "."]);
  git(root, ["checkout", "--quiet", "--detach", base]);
  assert.notEqual(spawnSync("git", ["cat-file", "-e", `${base}:db/migration-provenance.json`], { cwd: root, env }).status, 0);
  for (const item of ["db", "scripts/data", "package.json", "pnpm-lock.yaml", ".gitignore"]) {
    cpSync(path.join(repoRoot, item), path.join(root, item), { recursive: true });
  }
  symlinkSync(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"), "dir");
  git(root, ["-c", "user.name=Migration Test", "-c", "user.email=test@example.invalid", "add", "."]);
  git(root, ["-c", "core.hooksPath=/dev/null", "-c", "user.name=Migration Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "bootstrap tooling under test"]);
  return { root, base };
}

function run(root, script, args) {
  return spawnSync(process.execPath, [`scripts/data/${script}.mjs`, ...args], { cwd: root, env, encoding: "utf8" });
}

function check(root, base, scenario, expected) {
  const reportDir = path.join(reportRoot, scenario);
  const result = run(root, "check-migration-provenance", ["--base", base, "--report-dir", reportDir]);
  assert.equal(result.status, expected === "pass" ? 0 : 1, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(readFileSync(path.join(reportDir, "migration-provenance.json"), "utf8"));
  assert.equal(report.verdict, expected);
  return report;
}

function forge(root, schemaChanging) {
  const tag = schemaChanging ? "0025_handwritten_schema" : "0025_handwritten_data";
  const snapshotFile = "0025_snapshot.json";
  const snapshot = JSON.parse(readFileSync(path.join(root, "db/migrations/meta/0024_snapshot.json"), "utf8"));
  snapshot.prevId = snapshot.id;
  snapshot.id = "11111111-1111-4111-8111-111111111111";
  if (schemaChanging) {
    const file = path.join(root, "db/schema/users.ts");
    writeFileSync(file, readFileSync(file, "utf8").replace('  updated_at: text("updated_at"),', '  bootstrap_probe: text("bootstrap_probe"),\n  updated_at: text("updated_at"),'));
    snapshot.tables.users.columns.bootstrap_probe = {
      name: "bootstrap_probe", type: "text", primaryKey: false, notNull: false, autoincrement: false,
    };
  }
  writeFileSync(path.join(root, `db/migrations/meta/${snapshotFile}`), JSON.stringify(snapshot, null, 2));
  writeFileSync(path.join(root, `db/migrations/${tag}.sql`), schemaChanging
    ? "ALTER TABLE users ADD COLUMN bootstrap_probe TEXT;\n"
    : "UPDATE users SET updated_at = updated_at;\n");
  const journalFile = path.join(root, "db/migrations/meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalFile, "utf8"));
  journal.entries.push({ idx: 25, version: "6", when: 1788548742001, tag, breakpoints: true });
  writeFileSync(journalFile, JSON.stringify(journal, null, 2));
  appendGeneratedProvenance(root, { migrationFile: `${tag}.sql`, snapshotFile });
  assert.deepEqual(validateProvenanceState(loadProvenanceState(root)), []);
}

for (const schemaChanging of [false, true]) {
  const scenario = schemaChanging ? "handwritten-schema" : "handwritten-data";
  test(`bootstrap rejects ${scenario} despite internally valid forged provenance`, async () => {
    const { root, base } = fixture();
    try {
      forge(root, schemaChanging);
      const report = check(root, base, scenario, "fail");
      assert.ok(report.failures.some((item) => ["generated-reproduction", "generated-sql-modified"].includes(item.name)));
      assert.equal(report.checks.find((item) => item.name === "generated-reproduction").verdict, "fail");
      // Missing local base resolution must also use the pinned root.
      assert.ok((await verifyNewMigrationGeneratedFromBase(loadProvenanceState(root), null)).length > 0);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test("bootstrap accepts real wrapper output and clean no-op, with durable reports", () => {
  const { root, base } = fixture();
  try {
    let result = run(root, "generate-drizzle-migration", ["--name", "noop", "--report-dir", path.join(reportRoot, "noop")]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    check(root, base, "noop", "pass");
    const schemaFile = path.join(root, "db/schema/users.ts");
    writeFileSync(schemaFile, readFileSync(schemaFile, "utf8").replace('  updated_at: text("updated_at"),', '  bootstrap_probe: text("bootstrap_probe"),\n  updated_at: text("updated_at"),'));
    result = run(root, "generate-drizzle-migration", ["--name", "add_bootstrap_probe", "--report-dir", path.join(reportRoot, "generated")]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    check(root, base, "generated", "pass");
    const report = check(root, "does-not-exist", "invalid-base", "fail");
    assert.ok(report.failures.some((item) => item.name === "comparison-root"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("bootstrap journal and snapshot cannot be replaced by candidate metadata", () => {
  const { root, base } = fixture();
  try {
    const journalFile = path.join(root, "db/migrations/meta/_journal.json");
    const journal = JSON.parse(readFileSync(journalFile, "utf8"));
    journal.entries[0].when += 1;
    writeFileSync(journalFile, JSON.stringify(journal, null, 2));
    let report = check(root, base, "forged-bootstrap-journal", "fail");
    assert.ok(report.failures.some((item) => item.name === "base-history-modified"));
    const snapshotFile = path.join(root, "db/migrations/meta/0024_snapshot.json");
    writeFileSync(snapshotFile, `${readFileSync(snapshotFile, "utf8")}\n`);
    report = check(root, base, "forged-bootstrap-snapshot", "fail");
    assert.ok(report.failures.some((item) => item.name === "comparison-root"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
