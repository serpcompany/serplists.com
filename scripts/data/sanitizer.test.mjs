import { describe, expect, it } from "vitest";

import {
  generateSanitizedRehearsalArtifact,
  loadSanitizerPolicy,
  normalizeRehearsalDataExport,
  validateSanitizedRehearsalArtifact,
} from "./sanitizer-lib.mjs";

const repoRoot = new URL("../..", import.meta.url).pathname;
const generatedAt = new Date("2026-09-05T00:00:00.000Z");
const retentionDeadline = "2026-09-05T12:00:00.000Z";
const sourceDatabaseId = "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1";
const gitCommit = "0123456789abcdef0123456789abcdef01234567";

function generate() {
  return generateSanitizedRehearsalArtifact({
    repoRoot,
    rawExport: "PRAGMA defer_foreign_keys=TRUE;\nINSERT INTO users VALUES ('private');\n",
    sourceDatabaseId,
    sourceDate: "2026-09-05",
    gitCommit,
    issueNumber: 95,
    requestedApproverIdentity: "@devinschumacher",
    generatedAt,
    retentionDeadline,
  });
}

describe("repo-owned rehearsal sanitizer", () => {
  it("normalizes Wrangler data-only output into a migration-compatible artifact", () => {
    const template = generate().sql;
    const rawExport = [
      "PRAGMA defer_foreign_keys=TRUE;",
      "INSERT INTO d1_migrations VALUES(24,'0024_safe_template_evolution.sql','2026-09-05');",
      template,
    ].join("\n");

    expect(normalizeRehearsalDataExport({ repoRoot, rawExport })).toEqual({
      sql: template,
      sourceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      artifactSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(() => normalizeRehearsalDataExport({
      repoRoot,
      rawExport: `${rawExport}\nINSERT INTO session VALUES ('secret');`,
    })).toThrow(/unexpected table|authentication/i);
  });

  it("generates a strict integrity-checked synthetic artifact without carrying source values", () => {
    const artifact = generate();
    const policy = loadSanitizerPolicy({ repoRoot });

    expect(artifact.sql).not.toContain("private");
    expect(artifact.manifest).toMatchObject({
      schemaVersion: 1,
      artifactType: "synthetic-production-shaped",
      sanitizerVersion: "synthetic-production-shaped-v1",
      provenance: {
        generator: "scripts/data/sanitize-rehearsal-export.mjs",
        gitCommit,
        sourceKind: "protected-d1-data-only-export",
        sourceDate: "2026-09-05",
        verification: "unverified-request-metadata",
      },
      requestMetadata: {
        requestedApproverIdentity: "@devinschumacher",
        requestedPurpose: "staging-rehearsal-only",
        verification: "unverified-request-metadata",
      },
      privacy: {
        directIdentifiers: "none",
        privateContent: "none",
      },
    });
    expect(() =>
      validateSanitizedRehearsalArtifact({
        ...artifact,
        policy,
        now: generatedAt,
      }),
    ).not.toThrow();
  });

  it("rejects non-allowlisted requested approvers and sanitizer versions", () => {
    expect(() =>
      generateSanitizedRehearsalArtifact({
        ...generate().manifest.provenance,
        repoRoot,
        rawExport: "INSERT INTO users VALUES ('private');",
        sourceDatabaseId,
        sourceDate: "2026-09-05",
        gitCommit,
        issueNumber: 95,
        requestedApproverIdentity: "@unapproved-agent",
        generatedAt,
        retentionDeadline,
      }),
    ).toThrow(/allowlisted requested approver/i);

    const artifact = generate();
    artifact.manifest.sanitizerVersion = "caller-v99";
    expect(() =>
      validateSanitizedRehearsalArtifact({
        ...artifact,
        policy: loadSanitizerPolicy({ repoRoot }),
        now: generatedAt,
      }),
    ).toThrow(/sanitizer version/i);
  });

  it("binds production-shaped provenance to the checked-in production database", () => {
    expect(() => generateSanitizedRehearsalArtifact({
      repoRoot,
      rawExport: "INSERT INTO users VALUES ('private');",
      sourceDatabaseId: "fcaf4325-5be7-4ead-ab60-45932a04177b",
      sourceDate: "2026-09-05",
      gitCommit,
      issueNumber: 95,
      requestedApproverIdentity: "@devinschumacher",
      generatedAt,
      retentionDeadline,
    })).toThrow(/checked-in production database/i);

    const artifact = generate();
    artifact.manifest.provenance.sourceDatabaseIdSha256 = "0".repeat(64);
    expect(() => validateSanitizedRehearsalArtifact({
      ...artifact,
      policy: loadSanitizerPolicy({ repoRoot }),
      now: generatedAt,
    })).toThrow(/source identity.*checked-in production database/i);
  });

  it("rejects extra caller assertions and forged manifests for arbitrary SQL", () => {
    const artifact = generate();
    artifact.manifest.containsDirectIdentifiers = false;
    expect(() =>
      validateSanitizedRehearsalArtifact({
        ...artifact,
        policy: loadSanitizerPolicy({ repoRoot }),
        now: generatedAt,
      }),
    ).toThrow(/unrecognized|strict/i);

    const fresh = generate();
    expect(() =>
      validateSanitizedRehearsalArtifact({
        sql: "INSERT INTO templates VALUES ('caller-content');",
        manifest: fresh.manifest,
        policy: loadSanitizerPolicy({ repoRoot }),
        now: generatedAt,
      }),
    ).toThrow(/repo-owned synthetic profile/i);
  });

  it("adversarially rejects emails, UUID-like identifiers, names/private content, and auth material", () => {
    const manifest = generate().manifest;
    for (const [label, sql] of [
      ["email", "INSERT INTO users VALUES ('person@example.com');"],
      ["UUID-like", "INSERT INTO users VALUES ('8ab2b7e9-0ce8-4d1e-b42f-8601eb256b67');"],
      ["private content", "INSERT INTO templates VALUES ('Alice Smith private launch plan');"],
      ["authentication", "INSERT INTO session (token) VALUES ('secret');"],
      ["billing", "INSERT INTO stripe_customers VALUES ('cus_private');"],
      ["password", "INSERT INTO account (password) VALUES ('hash');"],
    ]) {
      expect(() =>
        validateSanitizedRehearsalArtifact({
          sql,
          manifest,
          policy: loadSanitizerPolicy({ repoRoot }),
          now: generatedAt,
        }),
      ).toThrow(new RegExp(label, "i"));
    }
  });
});
