import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import {
  assertFixtureResults,
  runDataCommand,
  validateRehearsalCreationEvidence,
} from "./data-command-lib.mjs";
import { generateSanitizedRehearsalArtifact } from "./sanitizer-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const stagingId = "fcaf4325-5be7-4ead-ab60-45932a04177b";
const productionId = "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1";
const rehearsalId = "8ab2b7e9-0ce8-4d1e-b42f-8601eb256b67";
const fullGitCommit = "0123456789abcdef0123456789abcdef01234567";
const productionExportFixture = readFileSync(path.join(repoRoot, "scripts/data/fixtures/production-export-edge-cases.sql"), "utf8");
const creationEvidencePath = path.join(repoRoot, "tmp/data-reports/unit-creation.json");
mkdirSync(path.dirname(creationEvidencePath), { recursive: true });
writeFileSync(creationEvidencePath, JSON.stringify({ schemaVersion: 1, verdict: "pass", commit: fullGitCommit, runId: "123456789", createdAt: "2026-09-05T00:00:00.000Z", target: { environment: "rehearsal", binding: "DB", databaseName: "serp-checklists-rehearsal-issue-95", databaseId: rehearsalId } }));
afterAll(() => rmSync(creationEvidencePath, { force: true }));

function writeGeneratedArtifact() {
  const tempDir = mkdtempSync(path.join(tmpdir(), "serp-generated-import-"));
  const inputPath = path.join(tempDir, "sanitized.sql");
  const manifestPath = path.join(tempDir, "manifest.json");
  const artifact = generateSanitizedRehearsalArtifact({
    repoRoot,
    rawExport: productionExportFixture,
    sourceDatabaseId: productionId,
    sourceDate: "2026-09-05",
    gitCommit: fullGitCommit,
    issueNumber: 95,
    requestedApproverIdentity: "@devinschumacher",
    generatedAt: new Date("2026-09-05T00:00:00.000Z"),
    retentionDeadline: "2026-09-05T12:00:00.000Z",
  });
  writeFileSync(inputPath, artifact.sql, "utf8");
  writeFileSync(manifestPath, JSON.stringify(artifact.manifest), "utf8");
  return { tempDir, inputPath, manifestPath, artifact };
}

function protectedEnvironment(target = "staging") {
  return {
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "serpcompany/serplists.com",
    GITHUB_REF_PROTECTED: "true",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_RUN_ID: "123456789",
    GITHUB_SHA: fullGitCommit,
    DATA_PROMOTION_WORKFLOW: "data-promotion",
    DATA_PROTECTED_ENVIRONMENT: target,
    DATA_APPROVER_IDENTITY: "@devinschumacher",
  };
}

describe("data command", () => {
  it("prints exact identity before running and rechecks the live remote UUID", () => {
    const events = [];
    const result = runDataCommand({
      argv: ["invariant-capture", "--environment", "staging", "--execute"],
      repoRoot,
      gitCommit: "0123456789abcdef",
      write: (value) => events.push(["write", value]),
      runCommand: (command) => {
        events.push(["run", command]);
        if (command.includes("info")) {
          return JSON.stringify({ uuid: stagingId, name: "serp-checklists-staging-db" });
        }
        if (command.includes("SELECT id, name FROM d1_migrations ORDER BY id")) {
          return JSON.stringify([{ results: [{ id: 1, name: "0023_add_sitemap_revision_state.sql" }] }]);
        }
        return JSON.stringify([{ results: [{ invariant: "templates", total_rows: 20 }] }]);
      },
    });

    expect(events[0][0]).toBe("write");
    expect(JSON.parse(events[0][1])).toMatchObject({
      environment: "staging",
      databaseId: stagingId,
    });
    expect(events[1]).toEqual([
      "run",
      ["pnpm", "exec", "wrangler", "d1", "info", "serp-checklists-staging-db", "--json"],
    ]);
    expect(result.executed).toBe(true);
    expect(result.invariantContext).toEqual({
      appliedThrough: "0023_add_sitemap_revision_state.sql",
      sqlVersions: ["0001_initial_schema.sql"],
    });
  });

  it("runs 0024 invariant SQL only when the applied ledger includes 0024", () => {
    const commands = [];
    const result = runDataCommand({
      argv: ["invariant-capture", "--environment", "staging", "--execute"],
      repoRoot,
      gitCommit: "0123456789abcdef",
      write: () => {},
      runCommand: (command) => {
        commands.push(command);
        if (command.includes("info")) {
          return JSON.stringify({ uuid: stagingId, name: "serp-checklists-staging-db" });
        }
        if (command.includes("SELECT id, name FROM d1_migrations ORDER BY id")) {
          return JSON.stringify([{ results: [
            { id: 1, name: "0023_add_sitemap_revision_state.sql" },
            { id: 2, name: "0024_safe_template_evolution.sql" },
          ] }]);
        }
        return JSON.stringify([{ results: [{ invariant: "ok", total_rows: 0 }] }]);
      },
    });

    expect(commands.some((command) => command.some((part) =>
      String(part).endsWith("capture-invariants-0024.sql"),
    ))).toBe(true);
    expect(result.invariantContext.sqlVersions).toEqual([
      "0001_initial_schema.sql",
      "0024_safe_template_evolution.sql",
    ]);
  });

  it("fails closed before the action when live identity differs from inventory", () => {
    const commands = [];

    expect(() =>
      runDataCommand({
        argv: ["invariant-capture", "--environment", "staging", "--execute"],
        repoRoot,
        gitCommit: "0123456789abcdef",
        write: () => {},
        runCommand: (command) => {
          commands.push(command);
          return JSON.stringify({ uuid: productionId, name: "serp-checklists-db" });
        },
      }),
    ).toThrow(/live database identity mismatch/i);
    expect(commands).toHaveLength(1);
  });

  it("fails closed when a remote database identity changes immediately after mutation", () => {
    let infoCalls = 0;
    expect(() => runDataCommand({
      argv: ["migration-apply", "--environment", "staging", "--confirm-database-id", stagingId, "--execute"],
      repoRoot, gitCommit: fullGitCommit, env: { ...protectedEnvironment("staging"), GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/staging" }, write: () => {},
      runCommand: (command) => {
        if (command.includes("info")) {
          infoCalls += 1;
          return JSON.stringify({ uuid: infoCalls === 1 ? stagingId : rehearsalId, name: "serp-checklists-staging-db" });
        }
        return "migration applied";
      },
    })).toThrow(/identity mismatch/i);
    expect(infoCalls).toBe(2);
  });

  it("requires exact confirmation for a remote write", () => {
    expect(() =>
      runDataCommand({
        argv: ["fixture-setup", "--environment", "staging", "--execute"],
        repoRoot,
        gitCommit: "0123456789abcdef",
        write: () => {},
        runCommand: () => {
          throw new Error("must not run");
        },
      }),
    ).toThrow("--confirm-database-id");
  });

  it("refuses a directly invoked staging migration before Wrangler", () => {
    expect(() => runDataCommand({
      argv: [
        "migration-apply", "--environment", "staging",
        "--confirm-database-id", stagingId, "--execute",
      ],
      repoRoot,
      gitCommit: fullGitCommit,
      env: {},
      write: () => {},
      runCommand: () => { throw new Error("Wrangler must not run"); },
    })).toThrow(/staging mutation workflow context/i);
  });

  it("refuses remote rehearsal import without complete workflow request metadata", () => {
    const generated = writeGeneratedArtifact();
    try {
      expect(() => runDataCommand({
        argv: [
          "rehearsal-import", "--environment", "rehearsal",
          "--database-name", "serp-checklists-rehearsal-issue-95",
          "--database-id", rehearsalId,
          "--confirm-database-id", rehearsalId,
          "--input", generated.inputPath,
          "--manifest", generated.manifestPath,
          "--execute",
        ],
        repoRoot,
        gitCommit: fullGitCommit,
        now: new Date("2026-09-05T01:00:00.000Z"),
        env: {},
        write: () => {},
        runCommand: () => { throw new Error("must not run"); },
      })).toThrow(/workflow request context/i);
    } finally {
      rmSync(generated.tempDir, { recursive: true, force: true });
    }
  });

  it("allows an integrity-checked import only with exact workflow request metadata", () => {
    const generated = writeGeneratedArtifact();
    const commands = [];
    try {
      const result = runDataCommand({
        argv: [
          "rehearsal-import", "--environment", "rehearsal",
          "--database-name", "serp-checklists-rehearsal-issue-95",
          "--database-id", rehearsalId,
          "--confirm-database-id", rehearsalId,
          "--input", generated.inputPath,
          "--manifest", generated.manifestPath,
          "--execute",
        ],
        repoRoot,
        gitCommit: fullGitCommit,
        now: new Date("2026-09-05T01:00:00.000Z"),
        env: protectedEnvironment(),
        write: () => {},
        runCommand: (command) => {
          commands.push(command);
          return command.includes("info")
            ? JSON.stringify({ uuid: rehearsalId, name: "serp-checklists-rehearsal-issue-95" })
            : JSON.stringify([{ results: [] }]);
        },
      });
      expect(result.executed).toBe(true);
      expect(commands).toHaveLength(3);
      expect(commands.filter((command) => command.includes("info"))).toHaveLength(2);
    } finally {
      rmSync(generated.tempDir, { recursive: true, force: true });
    }
  });

  it("builds an empty rehearsal database through the migration before the reviewed range", () => {
    const commands = [];
    const expectedLedger = [
      "0001_initial_schema.sql", "0002_add_slug_to_templates.sql",
      "0002_add_username_and_profiles.sql", "0003_unique_template_slugs.sql",
      "0004_remove_affiliate_and_pages.sql", "0005_backfill_template_slugs.sql",
      "0007_add_checklist_run_progress.sql", "0008_better_auth.sql",
      "0009_stripe_billing.sql", "0010_entitlement_overrides.sql",
      "0011_add_template_version.sql", "0012_cleanup_junk_templates.sql",
      "0013_add_template_type.sql", "0014_make_users_password_hash_nullable.sql",
      "0015_add_users_created_at_default.sql", "0016_users_password_hash_nullable_live_safe.sql",
      "0017_add_checklist_run_sharing_fields.sql", "0018_rename_test_users.sql",
      "0019_add_template_seo_fields.sql", "0020_add_template_rules.sql",
      "0021_add_teams_audit_history.sql", "0022_enforce_single_active_team_owner.sql",
      "0023_add_sitemap_revision_state.sql",
    ];
    const result = runDataCommand({
      argv: [
        "rehearsal-baseline", "--environment", "rehearsal",
        "--database-name", "serp-checklists-rehearsal-issue-95",
        "--database-id", rehearsalId, "--confirm-database-id", rehearsalId,
        "--approver-identity", "@devinschumacher", "--before", "0024_safe_template_evolution.sql",
        "--creation-evidence", path.relative(repoRoot, creationEvidencePath),
        "--execute",
      ],
      repoRoot,
      gitCommit: fullGitCommit,
      now: new Date("2026-09-05T00:30:00.000Z"),
      env: protectedEnvironment(),
      write: () => {},
      runCommand: (command) => {
        commands.push(command);
        if (command.includes("info")) return JSON.stringify({ uuid: rehearsalId, name: "serp-checklists-rehearsal-issue-95" });
        if (command.some((part) => String(part).includes("total_objects"))) return JSON.stringify([{ results: [{ total_objects: 0 }] }]);
        if (command.some((part) => String(part).includes("SELECT id, name FROM d1_migrations ORDER BY id"))) {
          return JSON.stringify([{ results: expectedLedger.map((name, index) => ({ id: index + 1, name })) }]);
        }
        return JSON.stringify([{ results: [] }]);
      },
    });
    expect(result.executed).toBe(true);
    expect(result.plan.expectedAppliedMigrations).toEqual(expectedLedger);
    expect(commands.some((command) => command.some((part) => String(part).endsWith("0023_add_sitemap_revision_state.sql")))).toBe(true);
    expect(commands.some((command) => command.some((part) => String(part).endsWith("0024_safe_template_evolution.sql")))).toBe(false);
  });

  it("refuses to baseline a nonempty rehearsal database", () => {
    expect(() => runDataCommand({
      argv: [
        "rehearsal-baseline", "--environment", "rehearsal",
        "--database-name", "serp-checklists-rehearsal-issue-95",
        "--database-id", rehearsalId, "--confirm-database-id", rehearsalId,
        "--approver-identity", "@devinschumacher", "--before", "0024_safe_template_evolution.sql",
        "--creation-evidence", path.relative(repoRoot, creationEvidencePath),
        "--execute",
      ],
      repoRoot,
      gitCommit: fullGitCommit,
      now: new Date("2026-09-05T00:30:00.000Z"),
      env: protectedEnvironment(),
      write: () => {},
      runCommand: (command) => {
        if (command.includes("info")) return JSON.stringify({ uuid: rehearsalId, name: "serp-checklists-rehearsal-issue-95" });
        if (command.some((part) => String(part).includes("total_objects"))) return JSON.stringify([{ results: [{ total_objects: 1 }] }]);
        return JSON.stringify([{ results: [{ total_objects: 1 }] }]);
      },
    })).toThrow(/newly created empty database/i);
  });

  it("supports a first-migration rehearsal with an explicitly empty baseline ledger", () => {
    const result = runDataCommand({
      argv: [
        "rehearsal-baseline", "--environment", "rehearsal",
        "--database-name", "serp-checklists-rehearsal-issue-95",
        "--database-id", rehearsalId, "--confirm-database-id", rehearsalId,
        "--approver-identity", "@devinschumacher", "--before", "0001_initial_schema.sql",
        "--creation-evidence", path.relative(repoRoot, creationEvidencePath),
        "--execute",
      ],
      repoRoot,
      gitCommit: fullGitCommit,
      now: new Date("2026-09-05T00:30:00.000Z"),
      env: protectedEnvironment(),
      write: () => {},
      runCommand: (command) => {
        if (command.includes("info")) return JSON.stringify({ uuid: rehearsalId, name: "serp-checklists-rehearsal-issue-95" });
        if (command.some((part) => String(part).includes("total_objects"))) return JSON.stringify([{ results: [{ total_objects: 0 }] }]);
        return JSON.stringify([{ results: [] }]);
      },
    });
    expect(result.plan.expectedAppliedMigrations).toEqual([]);
  });

  it("keeps production recovery plan-only outside the issue 97 executor", () => {
    for (const operation of [
      "recovery-bookmark",
      "export",
      "recovery-export",
      "sanitizer-source-export",
    ]) {
      expect(() => runDataCommand({
        argv: [
          operation,
          "--environment", "production",
          "--approver-identity", "@devinschumacher",
          ...(operation.includes("export")
            ? ["--output", `tmp/data-evidence/${operation}.sql`]
            : []),
          "--execute",
        ],
        repoRoot,
        gitCommit: fullGitCommit,
        env: {},
        write: () => {},
        runCommand: () => { throw new Error("must not run"); },
      })).toThrow(/general data CLI|issue #97/i);
    }
  });

  it("never executes production recovery even when environment metadata is spoofed", () => {
    for (const operation of [
      "recovery-bookmark",
      "export",
      "recovery-export",
      "sanitizer-source-export",
    ]) {
      let ranWrangler = false;
      expect(() => runDataCommand({
        argv: [
          operation,
          "--environment", "production",
          "--approver-identity", "@devinschumacher",
          ...(operation.includes("export")
            ? ["--output", `tmp/data-evidence/spoofed-${operation}.sql`]
            : []),
          "--execute",
        ],
        repoRoot,
        gitCommit: fullGitCommit,
        env: protectedEnvironment("production"),
        write: () => {},
        runCommand: () => {
          ranWrangler = true;
          return "";
        },
      })).toThrow(/general data CLI|issue #97/i);
      expect(ranWrangler).toBe(false);
    }
  });

  it("normalizes rehearsal export output before exposing the compatible artifact", () => {
    const evidenceRoot = path.join(repoRoot, "tmp/data-evidence");
    mkdirSync(evidenceRoot, { recursive: true });
    const tempDir = mkdtempSync(path.join(evidenceRoot, "export-test-"));
    const outputPath = path.join(tempDir, "rehearsal-data.sql");
    const generated = writeGeneratedArtifact();
    try {
      runDataCommand({
        argv: [
          "rehearsal-export", "--environment", "rehearsal",
          "--database-name", "serp-checklists-rehearsal-issue-95",
          "--database-id", rehearsalId,
          "--confirm-database-id", rehearsalId,
          "--approver-identity", "@devinschumacher",
          "--output", path.relative(repoRoot, outputPath),
          "--execute",
        ],
        repoRoot,
        gitCommit: fullGitCommit,
        env: protectedEnvironment(),
        write: () => {},
        runCommand: (command) => {
          if (command.includes("info")) {
            return JSON.stringify({ uuid: rehearsalId, name: "serp-checklists-rehearsal-issue-95" });
          }
          const rawPath = command[command.indexOf("--output") + 1];
          writeFileSync(rawPath, [
            "PRAGMA defer_foreign_keys=TRUE;",
            "INSERT INTO d1_migrations VALUES(24,'0024_safe_template_evolution.sql','2026-09-05');",
            generated.artifact.sql,
          ].join("\n"));
          return "Done!";
        },
      });

      const normalized = readFileSync(outputPath, "utf8");
      expect(normalized).toContain("Source-derived, content-free production-shaped rehearsal artifact");
      expect(normalized).toContain("rehearsal-owner-1");
      expect(normalized).not.toContain("private.person@example.com");
      expect(existsSync(`${outputPath}.wrangler-raw.sql`)).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
      rmSync(generated.tempDir, { recursive: true, force: true });
    }
  });

  it("does not invoke Wrangler in the default dry run", () => {
    const output = [];
    const result = runDataCommand({
      argv: ["fixture-setup", "--environment", "local"],
      repoRoot,
      gitCommit: "0123456789abcdef",
      write: (value) => output.push(value),
      runCommand: () => {
        throw new Error("dry run must not execute");
      },
    });

    expect(result).toMatchObject({ executed: false });
    expect(JSON.parse(output[1])).toHaveProperty("command");
  });

  it("records the exact UUID returned after rehearsal creation", () => {
    const output = [];
    runDataCommand({
      argv: [
        "rehearsal-create",
        "--database-name",
        "serp-checklists-rehearsal-issue-95",
        "--evidence", "tmp/data-reports/unit-create-output.json",
        "--execute",
      ],
      repoRoot,
      gitCommit: fullGitCommit,
      now: new Date("2026-09-05T00:30:00.000Z"),
      env: protectedEnvironment(),
      write: (value) => output.push(value),
      runCommand: (command) => command.includes("info")
        ? JSON.stringify({ uuid: rehearsalId, name: "serp-checklists-rehearsal-issue-95" })
        : `database_name = "serp-checklists-rehearsal-issue-95"\ndatabase_id = "${rehearsalId}"`,
    });

    expect(JSON.parse(output.at(-1))).toMatchObject({
      createdIdentity: {
        environment: "rehearsal",
        databaseName: "serp-checklists-rehearsal-issue-95",
        databaseId: rehearsalId,
      },
    });
    rmSync(path.join(repoRoot, "tmp/data-reports/unit-create-output.json"), { force: true });
  });

  it("rejects stale, cross-run, cross-commit, and mismatched database creation evidence", () => {
    const expected = { environment: "rehearsal", binding: "DB", databaseName: "serp-checklists-rehearsal-issue-95", databaseId: rehearsalId };
    const evidence = { schemaVersion: 1, verdict: "pass", commit: fullGitCommit, runId: "123456789", createdAt: "2026-09-05T00:00:00.000Z", target: expected };
    const options = { evidence, expected, gitCommit: fullGitCommit, runId: "123456789", now: new Date("2026-09-05T00:30:00.000Z") };
    expect(validateRehearsalCreationEvidence(options)).toEqual(evidence);
    for (const changed of [{ ...evidence, commit: "f".repeat(40) }, { ...evidence, runId: "999" }, { ...evidence, createdAt: "2026-09-04T00:00:00.000Z" }, { ...evidence, target: { ...expected, databaseId: stagingId } }]) expect(() => validateRehearsalCreationEvidence({ ...options, evidence: changed })).toThrow();
  });

  it("fails when fixture teardown reports leaked rows", () => {
    expect(() =>
      assertFixtureResults(
        JSON.stringify([
          {
            results: [
              { fixture_table: "users", fixture_rows: 0 },
              { fixture_table: "templates", fixture_rows: 1 },
              { fixture_table: "checklist_runs", fixture_rows: 0 },
            ],
          },
        ]),
        { users: 0, templates: 0, checklistRuns: 0 },
      ),
    ).toThrow("templates expected 0, received 1");
  });
});
