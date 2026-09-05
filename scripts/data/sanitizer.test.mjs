import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { replayMigrations } from "./schema-contract.ts";
import { syntheticSourceDatabase, exportSyntheticRows } from "./sanitizer-test-source.mjs";
import { sanitizedState, verifySanitizedTransformation, validateSanitizedStateBinding } from "./sanitized-state-lib.mjs";
import { listMigrationFiles } from "./schema-contract.ts";
import { generateSanitizedRehearsalArtifact, loadSanitizerPolicy, normalizeRehearsalDataExport, validateSanitizedRehearsalArtifact } from "./sanitizer-lib.mjs";

const repoRoot = new URL("../..", import.meta.url).pathname;
const rawExport = readFileSync(path.join(repoRoot, "scripts/data/fixtures/production-export-edge-cases.sql"), "utf8");
const generatedAt = new Date("2026-09-05T00:00:00.000Z");
const retentionDeadline = "2026-09-05T12:00:00.000Z";
const sourceDatabaseId = "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1";
const gitCommit = "0123456789abcdef0123456789abcdef01234567";
const legacyContext = { migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" }, sourceSchema: "0023_add_sitemap_revision_state.sql" };
const currentContext = { migrationRange: { from: null, to: null }, sourceSchema: "0024_safe_template_evolution.sql" };
function generate(overrides = {}) { return generateSanitizedRehearsalArtifact({ repoRoot, rawExport, sourceDatabaseId, sourceDate: "2026-09-05", gitCommit, issueNumber: 95, requestedApproverIdentity: "@devinschumacher", generatedAt, retentionDeadline, ...legacyContext, ...overrides }); }

// Synthetic source fixture, exported from actual SQLite migration results.
// This is additional edge-case testing, not observed production coverage.
function exportRows(database) {
  return ["users", "templates", "checklist_runs"].flatMap((table) => database.prepare(`SELECT * FROM ${table}`).all().map((row) =>
    `INSERT INTO ${table} (${Object.keys(row).join(",")}) VALUES (${Object.values(row).map((value) => value == null ? "NULL" : typeof value === "number" ? value : `'${String(value).replaceAll("'", "''")}'`).join(",")});`
  )).join("\n");
}

it("accepts an actual post0024 export for application-only rehearsal without inventing legacy shapes", () => {
  const database = replayMigrations({ through: "0023_add_sitemap_revision_state.sql" });
  try {
    database.exec(rawExport);
    database.exec(readFileSync(path.join(repoRoot, "db/migrations/0024_safe_template_evolution.sql"), "utf8"));
    const artifact = normalizeRehearsalDataExport({ repoRoot, rawExport: exportRows(database), migrationRange: { from: null, to: null }, sourceSchema: "0024_safe_template_evolution.sql" });
    expect(artifact.coveredShapes).not.toContain("legacy-flat-items");
    expect(artifact.sql).toContain("content_version");
    expect(artifact.sql).toContain("retired_items");
  } finally { database.close(); }
});

describe("source-derived rehearsal sanitizer", () => {
  it("preserves source relationships and migration-edge shapes without source values", () => {
    const artifact = generate();
    expect(artifact.manifest).toMatchObject({ schemaVersion: 3, artifactType: "sanitized-production-shaped", sanitizerVersion: "source-derived-shape-v3", selection: { sourceCounts: { users: 1, templates: 2, checklistRuns: 2 }, selectedCounts: { users: 1, templates: 2, checklistRuns: 2 } }, privacy: { directIdentifiers: "removed", customerContent: "removed", credentialsAndSessions: "excluded", passwordMaterial: "excluded" }, handling: { accessOwner: "@devinschumacher", retentionDeadline } });
    expect(artifact.manifest.selection.coveredShapes).toEqual(expect.arrayContaining(artifact.manifest.selection.requiredShapes));
    for (const secret of ["private.person@example.com", "Private Person", "Customer", "Confidential", "secret note", "private-access-token", "private-session-token", "private-share-token", "8ab2b7e9", "987654321012345"]) expect(artifact.sql).not.toContain(secret);
    expect(artifact.sql).toContain('"order":17');
    expect(artifact.sql).toContain("rehearsal-template-1");
    expect(artifact.sql).toContain("rehearsal-run-1");
  });

  it("imports at 0023, applies the exact 0024 migration, and preserves valid relations", () => {
    const database = replayMigrations({ through: "0023_add_sitemap_revision_state.sql" });
    try {
      database.exec(generate().sql);
      expect(database.prepare("SELECT COUNT(*) total FROM checklist_runs r JOIN templates t ON t.id=r.template_id JOIN users u ON u.id=r.user_id").get()).toEqual({ total: 2 });
      database.exec(readFileSync(path.join(repoRoot, "db/migrations/0024_safe_template_evolution.sql"), "utf8"));
      expect(database.prepare("SELECT COUNT(*) total FROM templates WHERE content_version=version").get()).toEqual({ total: 2 });
      expect(database.prepare("SELECT COUNT(*) total FROM checklist_runs WHERE template_id IS NOT NULL AND template_version=0").get()).toEqual({ total: 2 });
      expect(database.prepare("SELECT COUNT(*) total FROM templates WHERE json_valid(items)=0").get()).toEqual({ total: 0 });
    } finally { database.close(); }
  });

  it("validates integrity, provenance, retention, owner, and shape coverage", () => {
    const artifact = generate(); const policy = loadSanitizerPolicy({ repoRoot });
    expect(() => validateSanitizedRehearsalArtifact({ ...artifact, policy, now: generatedAt, ...legacyContext })).not.toThrow();
    for (const mutate of [
      (item) => { item.manifest.sanitizerVersion = "caller-v99"; },
      (item) => { item.manifest.handling.accessOwner = "@unapproved-agent"; },
      (item) => { item.manifest.selection.coveredShapes = []; },
      (item) => { item.sql += "INSERT INTO session VALUES ('secret');"; },
    ]) { const changed = structuredClone(artifact); mutate(changed); expect(() => validateSanitizedRehearsalArtifact({ ...changed, policy, now: generatedAt, ...legacyContext })).toThrow(); }
  });

  it("fails closed for malformed, incomplete, or schema-bearing inputs", () => {
    for (const input of ["CREATE TABLE stolen(value TEXT); INSERT INTO stolen VALUES ('x');", "INSERT INTO unknown_customer_table VALUES ('x');", "INSERT INTO users (id,email) VALUES ('only-user','nobody');", rawExport.replace(/INSERT INTO checklist_runs[\s\S]*$/m, "")]) expect(() => normalizeRehearsalDataExport({ repoRoot, rawExport: input, ...legacyContext })).toThrow();
  });

  it("does not include authentication, billing, password, session, or share-token material", () => {
    const sql = generate().sql;
    expect(sql).not.toMatch(/INSERT INTO (?:account|session|verification|stripe_)/i);
    expect(sql).not.toContain("fixture-password-material");
    expect(sql).not.toContain("private-public-share-token");
    expect(sql).toMatch(/password_hash[^;]+VALUES \([^;]+NULL/i);
    expect(sql).toMatch(/share_token[^;]+VALUES \([^;]+NULL/i);
  });

  it("preserves current source versions and retired data; rejects rehashed privacy and metadata tampering", () => {
    const db = replayMigrations({ through: legacyContext.sourceSchema });
    try {
      db.exec(rawExport);
      db.exec(readFileSync(path.join(repoRoot, "db/migrations", currentContext.sourceSchema), "utf8"));
      db.exec("UPDATE checklist_runs SET revision=9, template_version=3, retired_items='[{\"id\":\"retired-source-id\",\"notes\":\"private retired note\"}]'");
      const artifact = generate({ ...currentContext, rawExport: exportRows(db) });
      expect(artifact.manifest.selection.absentSourceShapes).toContain("legacy-flat-items");
      expect(artifact.manifest.selection.syntheticEdgeCaseRequirements).toEqual([]);
      const target = replayMigrations();
      try {
        target.exec(artifact.sql);
        expect(target.prepare("SELECT revision,template_version FROM checklist_runs").all()).toEqual([{ revision: 9, template_version: 3 }, { revision: 9, template_version: 3 }]);
        expect(target.prepare("SELECT content_version FROM templates ORDER BY content_version").all()).toEqual(db.prepare("SELECT content_version FROM templates ORDER BY content_version").all());
        expect(JSON.parse(target.prepare("SELECT retired_items FROM checklist_runs LIMIT 1").get().retired_items)).toHaveLength(1);
      } finally { target.close(); }
      const policy = loadSanitizerPolicy({ repoRoot });
      const validate = (value, context = currentContext) => validateSanitizedRehearsalArtifact({ ...value, policy, now: generatedAt, ...context });
      expect(() => validate(artifact)).not.toThrow();
      expect(() => validate(artifact, legacyContext)).toThrow(/mismatch/);
      const hash = (value) => createHash("sha256").update(value).digest("hex");
      for (const mutate of [
        (a) => { a.manifest.sourceProfile.profile = "legacy-template-evolution-v1"; },
        (a) => { a.manifest.sourceProfile.sourceSchema = legacyContext.sourceSchema; },
        (a) => { a.manifest.sourceProfile.migrationRange = legacyContext.migrationRange; },
        (a) => { a.manifest.selection.coveredShapes = []; a.manifest.selection.requiredShapes = []; },
        (a) => { a.sql = a.sql.replace("sanitized-notes", "private notes"); },
        (a) => { a.sql = a.sql.replace("sanitized-owner-1", "sanitized-owner-private-customer"); },
        (a) => { a.sql += "UPDATE users SET password_hash='retained-secret';\n"; },
        (a) => { a.sql += "UPDATE templates SET description='retained customer content';\n"; },
        (a) => { a.sql += "UPDATE checklist_runs SET share_token='retained-token';\n"; },
      ]) {
        const changed = structuredClone(artifact); mutate(changed);
        changed.manifest.artifact = { sha256: hash(changed.sql), byteLength: Buffer.byteLength(changed.sql) };
        const { manifestIntegritySha256: _digest, ...unsigned } = changed.manifest;
        changed.manifest.manifestIntegritySha256 = hash(JSON.stringify(unsigned));
        expect(() => validate(changed)).toThrow();
      }
      expect(() => generate({ ...legacyContext, rawExport: exportRows(db) })).toThrow();
      expect(() => generate({ ...currentContext })).toThrow();
    } finally { db.close(); }
  });

  it("reports absent legacy edge cases honestly while retaining separate synthetic requirements", () => {
    const db = replayMigrations({ through: legacyContext.sourceSchema });
    try {
      db.exec(rawExport);
      db.exec("UPDATE templates SET items='[]'; UPDATE checklist_runs SET items='[]'");
      const artifact = generate({ rawExport: exportRows(db) });
      expect(artifact.manifest.selection.observedSourceShapes).toEqual([]);
      expect(artifact.manifest.selection.requiredShapes).toEqual([]);
      expect(artifact.manifest.selection.absentSourceShapes).toContain("legacy-flat-items");
      expect(artifact.manifest.selection.syntheticEdgeCaseRequirements).toContain("legacy-flat-items");
    } finally { db.close(); }
  });

  it.each([false, true])("round-trips actual SQLite source/export/transformation/recovery (current=%s)", (current) => {
    const context = current ? currentContext : legacyContext;
    const source = syntheticSourceDatabase(repoRoot, current);
    const target = replayMigrations({ through: context.sourceSchema });
    const restore = replayMigrations();
    try {
      const artifact = generate({ ...context, rawExport: exportSyntheticRows(source) });
      const ledger = listMigrationFiles().map((file) => file.name);
      const capture = (db, applied) => sanitizedState({ templates: db.prepare("SELECT * FROM templates").all(), runs: db.prepare("SELECT * FROM checklist_runs").all(), ledger: applied, sourceSha256: artifact.manifest.artifact.sha256 });
      target.exec(artifact.sql);
      const before = capture(target, current ? ledger : ledger.slice(0, -1));
      if (!current) target.exec(readFileSync(path.join(repoRoot, "db/migrations", currentContext.sourceSchema), "utf8"));
      const after = capture(target, ledger);
      expect(verifySanitizedTransformation({ before, after, expectedLedger: ledger }).verdict).toBe("pass");
      if (current) expect(after.domainSha256).toBe(before.domainSha256);
      restore.exec(exportSyntheticRows(target));
      expect(validateSanitizedStateBinding(after, capture(restore, ledger))).toBe(true);
      restore.exec("UPDATE checklist_runs SET revision=revision+1");
      expect(() => validateSanitizedStateBinding(after, capture(restore, ledger))).toThrow(/domainSha256/);
    } finally { source.close(); target.close(); restore.close(); }
  });
});
