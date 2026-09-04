import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { replayMigrations } from "./schema-contract.ts";
import { generateSanitizedRehearsalArtifact, loadSanitizerPolicy, normalizeRehearsalDataExport, validateSanitizedRehearsalArtifact } from "./sanitizer-lib.mjs";

const repoRoot = new URL("../..", import.meta.url).pathname;
const rawExport = readFileSync(path.join(repoRoot, "scripts/data/fixtures/production-export-edge-cases.sql"), "utf8");
const generatedAt = new Date("2026-09-05T00:00:00.000Z");
const retentionDeadline = "2026-09-05T12:00:00.000Z";
const sourceDatabaseId = "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1";
const gitCommit = "0123456789abcdef0123456789abcdef01234567";
function generate() { return generateSanitizedRehearsalArtifact({ repoRoot, rawExport, sourceDatabaseId, sourceDate: "2026-09-05", gitCommit, issueNumber: 95, requestedApproverIdentity: "@devinschumacher", generatedAt, retentionDeadline }); }

describe("source-derived rehearsal sanitizer", () => {
  it("preserves source relationships and migration-edge shapes without source values", () => {
    const artifact = generate();
    expect(artifact.manifest).toMatchObject({ schemaVersion: 2, artifactType: "sanitized-production-shaped", sanitizerVersion: "source-derived-shape-v2", selection: { sourceCounts: { users: 1, templates: 2, checklistRuns: 2 }, selectedCounts: { users: 1, templates: 2, checklistRuns: 2 } }, privacy: { directIdentifiers: "removed", customerContent: "removed", credentialsAndSessions: "excluded", passwordMaterial: "excluded" }, handling: { accessOwner: "@devinschumacher", retentionDeadline } });
    expect(artifact.manifest.selection.coveredShapes).toEqual(expect.arrayContaining(artifact.manifest.selection.requiredShapes));
    for (const secret of ["private.person@example.com", "Private Person", "Customer", "Confidential", "secret note", "private-access-token", "private-session-token", "private-share-token", "8ab2b7e9"]) expect(artifact.sql).not.toContain(secret);
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
    expect(() => validateSanitizedRehearsalArtifact({ ...artifact, policy, now: generatedAt })).not.toThrow();
    for (const mutate of [
      (item) => { item.manifest.sanitizerVersion = "caller-v99"; },
      (item) => { item.manifest.handling.accessOwner = "@unapproved-agent"; },
      (item) => { item.manifest.selection.coveredShapes = []; },
      (item) => { item.sql += "INSERT INTO session VALUES ('secret');"; },
    ]) { const changed = structuredClone(artifact); mutate(changed); expect(() => validateSanitizedRehearsalArtifact({ ...changed, policy, now: generatedAt })).toThrow(); }
  });

  it("fails closed for malformed, incomplete, or schema-bearing inputs", () => {
    for (const input of ["CREATE TABLE stolen(value TEXT); INSERT INTO stolen VALUES ('x');", "INSERT INTO unknown_customer_table VALUES ('x');", "INSERT INTO users (id,email) VALUES ('only-user','nobody');", rawExport.replace(/INSERT INTO checklist_runs[\s\S]*$/m, "")]) expect(() => normalizeRehearsalDataExport({ repoRoot, rawExport: input })).toThrow();
  });

  it("does not include authentication, billing, password, session, or share-token material", () => {
    const sql = generate().sql;
    expect(sql).not.toMatch(/INSERT INTO (?:account|session|verification|stripe_)/i);
    expect(sql).not.toContain("fixture-password-material");
    expect(sql).not.toContain("private-public-share-token");
    expect(sql).toMatch(/password_hash[^;]+VALUES \([^;]+NULL/i);
    expect(sql).toMatch(/share_token[^;]+VALUES \([^;]+NULL/i);
  });
});
