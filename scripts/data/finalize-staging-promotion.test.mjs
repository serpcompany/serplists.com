import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const commit = "a".repeat(40);
const tree = "b".repeat(40);
const databaseName = "serp-checklists-staging-db";
const databaseId = "fcaf4325-5be7-4ead-ab60-45932a04177b";

function runFinalizer({ mutate = () => {} } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "staging-finalizer-"));
  const reports = {
    data: { verdict: "pass", commit, teardown: { verdict: "pass", leakedUsers: 0, leakedTemplates: 0, leakedRuns: 0 } },
    range: { verdict: "pass", commit, baseCommit: "c".repeat(40), target: { environment: "staging", databaseName, databaseId }, migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" }, pendingMigrations: ["0024_safe_template_evolution.sql"] },
    schema: { verdict: "pass", commit, target: { environment: "staging", database: databaseName, databaseId }, ledger: { verdict: "pass" } },
    invariants: { verdict: "pass", commit, comparisonKind: "migration", target: { environment: "staging", binding: "DB", databaseName, databaseId }, migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" }, ledger: { verdict: "pass", before: ["0023_add_sitemap_revision_state.sql"], after: ["0023_add_sitemap_revision_state.sql", "0024_safe_template_evolution.sql"] } },
    deploy: { verdict: "pass", commit, tree, target: { environment: "staging", databaseName, databaseId } },
    smoke: { verdict: "pass", commit, target: { environment: "staging", databaseName, databaseId }, failures: [], controlledCanaryMutationApproved: true, canaryEvidenceDigest: "a".repeat(64), checks: ["template_canary_designated", "template_write", "template_write_readback", "template_restore", "run_canary_designated", "run_write", "run_write_readback", "run_restore"].map((name) => ({ name, verdict: "pass" })) },
  };
  mutate(reports);
  const args = [];
  for (const [name, value] of Object.entries(reports)) {
    const file = path.join(directory, `${name}.json`);
    writeFileSync(file, JSON.stringify(value));
    args.push(`--${name}`, file);
  }
  const output = path.join(directory, "output", "staging-promotion.json");
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("./finalize-staging-promotion.mjs", import.meta.url)),
    ...args, "--commit", commit, "--tree", tree, "--database-name", databaseName,
    "--database-id", databaseId, "--output", output,
  ]);
  return { directory, output, result };
}

describe("staging promotion finalizer", () => {
  it("binds passing data, ledger, invariant, deploy, smoke, and teardown evidence to one commit and tree", () => {
    const run = runFinalizer();
    try {
      expect(run.result.status).toBe(0);
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
  it.each([
    ["wrong invariant commit", (reports) => { reports.invariants.commit = "f".repeat(40); }],
    ["wrong invariant database", (reports) => { reports.invariants.target.databaseId = "11111111-1111-4111-8111-111111111111"; }],
    ["wrong invariant range", (reports) => { reports.invariants.migrationRange.to = "0023_add_sitemap_revision_state.sql"; }],
    ["reordered ledger", (reports) => { reports.invariants.ledger.after = ["0024_safe_template_evolution.sql", "0023_add_sitemap_revision_state.sql"]; }],
    ["missing canary restore", (reports) => { reports.smoke.checks = reports.smoke.checks.filter((check) => check.name !== "run_restore"); }],
  ])("rejects %s", (_name, mutate) => {
    const run = runFinalizer({ mutate });
    try { expect(run.result.status).toBe(1); expect(JSON.parse(readFileSync(run.output, "utf8")).verdict).toBe("fail"); }
    finally { rmSync(run.directory, { recursive: true, force: true }); }
  });
});
