import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { captureRepositoryGitState } from "./git-subprocess-env.mjs";
import { affectedTablesFromSql, resolveRehearsalPlan, validateCoverageMatch } from "./rehearsal-plan-lib.mjs";
const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const commit = captureRepositoryGitState({ repoRoot }).commit;
describe("reviewed rehearsal plan", () => {
  it("binds the legacy 0024 fixture and affected-domain declaration", () => {
    const plan = resolveRehearsalPlan({ repoRoot, commit, migrationFrom: "0024_safe_template_evolution.sql", migrationTo: "0024_safe_template_evolution.sql" });
    expect(plan).toMatchObject({ id: "safe-template-evolution-0024", preMigration: "0023_add_sitemap_revision_state.sql", affectedTables: ["templates", "checklist_runs"], migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" } });
    expect(plan.invariants).toEqual(expect.arrayContaining(["authenticated-owned-template-read-write", "authenticated-owned-run-read-write"]));
  });
  it("derives an application-only plan when a trusted base has no changed data artifacts", () => {
    expect(resolveRehearsalPlan({ repoRoot, commit, baseRef: commit })).toMatchObject({ id: "application-only-at-0024", migrationRange: { from: null, to: null }, changedArtifacts: [] });
  });
  it("fails closed for an unconfigured synthetic 0025 other-table migration", () => {
    const sql = readFileSync(path.join(repoRoot, "scripts/data/fixtures/0025_other_table.sql"), "utf8");
    expect(affectedTablesFromSql(sql)).toEqual(["usage_analytics"]);
    expect(() => resolveRehearsalPlan({ repoRoot, commit, migrationFrom: "0025_other_table.sql", migrationTo: "0025_other_table.sql" })).toThrow(/no rehearsal plan/i);
  });
  it("rejects fixed 0024 evidence for another range or affected domain", () => {
    const plan = resolveRehearsalPlan({ repoRoot, commit });
    const evidence = { commit, migrationRange: plan.migrationRange, coverage: { planId: plan.id, declarationSha256: plan.declarationSha256, affectedTables: plan.affectedTables, invariants: plan.invariants } };
    expect(validateCoverageMatch({ evidence, expected: plan })).toEqual(evidence);
    expect(() => validateCoverageMatch({ evidence, expected: { ...plan, migrationRange: { from: "0025_other_table.sql", to: "0025_other_table.sql" }, affectedTables: ["usage_analytics"] } })).toThrow(/range.*coverage/i);
  });
});
