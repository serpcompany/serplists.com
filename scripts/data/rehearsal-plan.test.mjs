import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
  it("detects bracket-quoted DML and index target tables", () => {
    const sql = "ALTER TABLE templates ADD COLUMN probe TEXT; CREATE INDEX audit_probe ON [audit_events](created_at); UPDATE [users] SET referral_count=0;";
    expect(affectedTablesFromSql(sql)).toEqual(["audit_events", "templates", "users"]);
    expect(() => affectedTablesFromSql("WITH changed AS (SELECT 1) UPDATE [users] SET referral_count=1;")).toThrow(/unsupported SQL/i);
    expect(() => affectedTablesFromSql("DROP INDEX audit_probe;")).toThrow(/unsupported SQL/i);
  });
  it("parses quoted and schema-qualified targets without treating comments or strings as SQL", () => {
    const sql = `
      -- UPDATE hidden SET value = 1;
      INSERT OR REPLACE INTO main."templates" (id, title) VALUES ('a; -- DELETE FROM users', '/* DROP TABLE teams */');
      REPLACE INTO [main].[checklist_runs] (id) VALUES ('r');
      UPDATE OR FAIL \`main\`.\`users\` SET name = 'semi;colon';
      CREATE UNIQUE INDEX "audit;probe" ON main.[audit_events](created_at);
      DELETE FROM main."archive.templates" WHERE id = 'old';
      /* CREATE TABLE secrets(id TEXT); */
    `;
    expect(affectedTablesFromSql(sql)).toEqual(["archive.templates", "audit_events", "checklist_runs", "templates", "users"]);
  });
  it("accounts for both source and destination tables in ALTER TABLE RENAME TO", () => {
    expect(affectedTablesFromSql("ALTER TABLE templates RENAME TO templates_archive;")).toEqual(["templates", "templates_archive"]);
    expect(affectedTablesFromSql('ALTER TABLE main."old.templates" RENAME TO [new.templates];')).toEqual(["new.templates", "old.templates"]);
    expect(affectedTablesFromSql("ALTER TABLE `main`.`old_templates` RENAME TO `new_templates`;")).toEqual(["new_templates", "old_templates"]);
    expect(() => affectedTablesFromSql("ALTER TABLE templates RENAME TO 'invalid';")).toThrow(/unsupported SQL/i);
  });
  it.each([
    ["virtual table", "CREATE VIRTUAL TABLE search USING fts5(content);"],
    ["schema view", "CREATE VIEW active_templates AS SELECT * FROM templates;"],
    ["trigger", "CREATE TRIGGER template_audit AFTER UPDATE ON templates BEGIN SELECT 1; END;"],
    ["unknown replace variant", "REPLACE OR IGNORE INTO templates(id) VALUES ('t');"],
    ["unknown database mutation", "VACUUM;"],
  ])("fails closed for unaccounted %s SQL", (_name, sql) => {
    expect(() => affectedTablesFromSql(sql)).toThrow(/unsupported SQL/i);
  });
  it("rejects maintenance SQL declarations until a classified execution path exists", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "rehearsal-maintenance-"));
    try {
      const declaration = JSON.parse(readFileSync(path.join(repoRoot, "scripts/data/rehearsal-plans.json"), "utf8"));
      declaration.plans[0].artifacts.push("db/maintenance/cleanup_seed_data.sql");
      const planPath = path.join(directory, "plans.json");
      writeFileSync(planPath, JSON.stringify(declaration));
      expect(() => resolveRehearsalPlan({ repoRoot, commit, migrationFrom: "0024_safe_template_evolution.sql", migrationTo: "0024_safe_template_evolution.sql", planPath })).toThrow(/maintenance SQL.*blocked/i);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it("rejects fixed 0024 evidence for another range or affected domain", () => {
    const plan = resolveRehearsalPlan({ repoRoot, commit });
    const evidence = { commit, migrationRange: plan.migrationRange, coverage: { planId: plan.id, declarationSha256: plan.declarationSha256, artifactSha256: plan.artifactSha256, affectedTables: plan.affectedTables, invariants: plan.invariants } };
    expect(validateCoverageMatch({ evidence, expected: plan })).toEqual(evidence);
    expect(() => validateCoverageMatch({ evidence, expected: { ...plan, migrationRange: { from: "0025_other_table.sql", to: "0025_other_table.sql" }, affectedTables: ["usage_analytics"] } })).toThrow(/range.*coverage/i);
  });
  it.each([
    ["usage_analytics table", (value) => value.plans[0].affectedTables.push("usage_analytics")],
    ["nonexistent invariant", (value) => value.plans[0].invariants.push("nonexistent-invariant")],
  ])("rejects a fixture profile that falsely claims %s coverage", (_name, mutate) => {
    const directory = mkdtempSync(path.join(tmpdir(), "rehearsal-plan-claims-"));
    try {
      const declaration = JSON.parse(readFileSync(path.join(repoRoot, "scripts/data/rehearsal-plans.json"), "utf8"));
      mutate(declaration);
      const planPath = path.join(directory, "plans.json");
      writeFileSync(planPath, JSON.stringify(declaration));
      expect(() => resolveRehearsalPlan({ repoRoot, commit, migrationFrom: "0024_safe_template_evolution.sql", migrationTo: "0024_safe_template_evolution.sql", planPath })).toThrow(/unsupported affected-table or invariant claims/i);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
