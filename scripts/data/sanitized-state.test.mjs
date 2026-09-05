import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { replayMigrations, listMigrationFiles } from "./schema-contract.ts";
import { generateSanitizedRehearsalArtifact } from "./sanitizer-lib.mjs";
import { sanitizedState, verifySanitizedTransformation, validateSanitizedStateBinding } from "./sanitized-state-lib.mjs";

const repoRoot = new URL("../..", import.meta.url).pathname;
const migration = "0024_safe_template_evolution.sql";
const ledger = listMigrationFiles().map((file) => file.name);
const artifact = generateSanitizedRehearsalArtifact({ repoRoot, rawExport: readFileSync(path.join(repoRoot, "scripts/data/fixtures/production-export-edge-cases.sql"), "utf8"), sourceDatabaseId: "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1", sourceDate: "2026-09-05", gitCommit: "a".repeat(40), issueNumber: 95, requestedApproverIdentity: "@devinschumacher", generatedAt: new Date("2026-09-05T00:00:00Z"), retentionDeadline: "2026-09-05T12:00:00Z" });
const snapshot = (db, applied) => sanitizedState({ templates: db.prepare("SELECT * FROM templates").all(), runs: db.prepare("SELECT * FROM checklist_runs").all(), ledger: applied, sourceSha256: artifact.manifest.artifact.sha256 });

describe("sanitized candidate state", () => {
  it("rejects a corrupted transformation with a valid final schema before authenticated rehearsal can pass", () => {
    const db = replayMigrations({ through: "0023_add_sitemap_revision_state.sql" });
    try {
      db.exec(artifact.sql);
      const before = snapshot(db, ledger.slice(0, -1));
      db.exec(readFileSync(path.join(repoRoot, "db/migrations", migration), "utf8"));
      const after = snapshot(db, ledger);
      expect(() => verifySanitizedTransformation({ before, after, expectedLedger: ledger })).not.toThrow();
      // Same schema, row counts, owner, and valid JSON; only the data transform is wrong.
      db.exec("UPDATE templates SET version=version-1, content_version=content_version-1");
      expect(db.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
      expect(() => verifySanitizedTransformation({ before, after: snapshot(db, ledger), expectedLedger: ledger })).toThrow(/version transition/);
    } finally { db.close(); }
  });

  it("binds every stored domain field and exact ledger and rejects alternate remote state", () => {
    const state = sanitizedState({ templates: [{ id: "rehearsal-template-1", title: "safe", version: 2, content_version: 2 }], runs: [], ledger, sourceSha256: artifact.manifest.artifact.sha256 });
    expect(validateSanitizedStateBinding(state, structuredClone(state))).toBe(true);
    for (const field of ["sourceSha256", "domainSha256", "ledgerSha256"]) expect(() => validateSanitizedStateBinding(state, { ...state, [field]: "f".repeat(64) })).toThrow();
    expect(() => validateSanitizedStateBinding(state, { ...state, ledger: ledger.slice(0, -1) })).toThrow();
    for (const field of ["title", "version", "content_version"]) {
      const changed = structuredClone(state.rows.templates); changed[0][field] = "changed";
      expect(sanitizedState({ templates: changed, runs: [], ledger, sourceSha256: state.sourceSha256 }).domainSha256).not.toBe(state.domainSha256);
    }
  });
});
