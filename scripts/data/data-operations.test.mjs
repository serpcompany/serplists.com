import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadEnvironmentInventory, resolveEnvironmentIdentity } from "./environment-identity-lib.mjs";
import {
  buildDataOperationPlan,
  buildRehearsalCreatePlan,
} from "./data-operations-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const inventory = loadEnvironmentInventory({ repoRoot });
const productionId = inventory.environments.production.databaseId;
const rehearsalId = "8ab2b7e9-0ce8-4d1e-b42f-8601eb256b67";

function identity(environment, overrides = {}) {
  return resolveEnvironmentIdentity({ environment, inventory, ...overrides });
}

describe("data operation plans", () => {
  it("includes exact environment, database, commit, and migration identity in every report", () => {
    const plan = buildDataOperationPlan({
      operation: "invariant-capture",
      identity: identity("staging"),
      repoRoot,
      gitCommit: "0123456789abcdef",
    });

    expect(plan.report).toMatchObject({
      environment: "staging",
      binding: "DB",
      databaseName: "serp-checklists-staging-db",
      databaseId: "fcaf4325-5be7-4ead-ab60-45932a04177b",
      gitCommit: "0123456789abcdef",
      migrationRange: { latest: "0024_safe_template_evolution.sql" },
    });
    expect(plan.command).toContain("--preview");
    expect(plan.invariantLedgerCommand).toEqual(expect.arrayContaining([
      "--command",
      "SELECT id, name FROM d1_migrations ORDER BY id",
    ]));
    expect(plan.versionedInvariantCommands).toHaveLength(1);
  });

  it("provides a ledger command for each environment before promotion", () => {
    expect(
      buildDataOperationPlan({
        operation: "migration-ledger",
        identity: identity("staging"),
        repoRoot,
        gitCommit: "0123456789abcdef",
      }).command,
    ).toEqual([
      "pnpm",
      "exec",
      "wrangler",
      "d1",
      "migrations",
      "list",
      "DB",
      "--remote",
      "--preview",
    ]);
  });

  it("requires the protected staging execution boundary for staging mutations", () => {
    const plan = buildDataOperationPlan({
      operation: "migration-apply",
      identity: identity("staging"),
      repoRoot,
      gitCommit: "0123456789abcdef",
    });
    expect(plan.requiresStagingExecutionBoundary).toBe(true);
    expect(buildDataOperationPlan({
      operation: "migration-ledger",
      identity: identity("staging"),
      repoRoot,
      gitCommit: "0123456789abcdef",
    }).requiresStagingExecutionBoundary).toBe(false);
  });

  it("builds migration apply only for an exact non-production target", () => {
    expect(
      buildDataOperationPlan({
        operation: "migration-apply",
        identity: identity("rehearsal", {
          databaseId: rehearsalId,
          databaseName: "serp-checklists-rehearsal-issue-95",
        }),
        repoRoot,
        gitCommit: "0123456789abcdef",
      }).command,
    ).toEqual([
      "pnpm",
      "exec",
      "wrangler",
      "d1",
      "migrations",
      "apply",
      "serp-checklists-rehearsal-issue-95",
      "--remote",
    ]);
  });

  it("builds recovery restore only for rehearsal plaintext outside artifact directories", () => {
    const rehearsal = identity("rehearsal", {
      databaseId: rehearsalId,
      databaseName: "serp-checklists-rehearsal-issue-95",
    });
    const plan = buildDataOperationPlan({
      operation: "recovery-restore",
      identity: rehearsal,
      repoRoot,
      gitCommit: "0123456789abcdef",
      importPath: "tmp/rehearsal-sensitive/recovery.sql",
    });
    expect(plan.command).toEqual(expect.arrayContaining([
      "--file", path.join(repoRoot, "tmp/rehearsal-sensitive/recovery.sql"),
    ]));
    expect(plan.requiresWorkflowRequestContext).toBe(true);
    expect(plan.report.recoveryRestore.artifactUpload).toBe("forbidden");
    expect(() => buildDataOperationPlan({
      operation: "recovery-restore",
      identity: rehearsal,
      repoRoot,
      gitCommit: "0123456789abcdef",
      importPath: "tmp/data-reports/recovery.sql",
    })).toThrow(/rehearsal-sensitive/i);
  });

  it("keeps isolated local rehearsal state under the ignored Wrangler directory", () => {
    const plan = buildDataOperationPlan({
      operation: "fixture-setup",
      identity: identity("local"),
      repoRoot,
      gitCommit: "0123456789abcdef",
      persistTo: ".wrangler/rehearsals/issue-95",
    });

    expect(plan.command).toContain("--persist-to");
    expect(plan.command).toContain(path.join(repoRoot, ".wrangler/rehearsals/issue-95"));
    expect(() =>
      buildDataOperationPlan({
        operation: "fixture-setup",
        identity: identity("local"),
        repoRoot,
        gitCommit: "0123456789abcdef",
        persistTo: "/tmp/untracked-rehearsal",
      }),
    ).toThrow(/\.wrangler\/rehearsals/i);
  });

  it("plans recovery bookmarks and every export mode with verified Wrangler flags", () => {
    const schemaExport = buildDataOperationPlan({
      operation: "export",
      identity: identity("local"),
      repoRoot,
      gitCommit: "0123456789abcdef",
      outputPath: "tmp/data-evidence/local-schema.sql",
    });
    expect(schemaExport.command).toContain("--no-data");

    const rehearsal = identity("rehearsal", {
      databaseId: rehearsalId,
      databaseName: "serp-checklists-rehearsal-issue-95",
    });
    const rehearsalExport = buildDataOperationPlan({
      operation: "rehearsal-export",
      identity: rehearsal,
      repoRoot,
      gitCommit: "0123456789abcdef",
      outputPath: "tmp/data-evidence/rehearsal-data.sql",
    });
    expect(rehearsalExport.command).toEqual(expect.arrayContaining(["--no-schema"]));
    expect(rehearsalExport.command).not.toContain("--skip-confirmation");
    expect(rehearsalExport.command).not.toContain("--no-data");

    const sanitizerSource = buildDataOperationPlan({
      operation: "sanitizer-source-export",
      identity: identity("production"),
      repoRoot,
      gitCommit: "0123456789abcdef",
      outputPath: "tmp/data-evidence/private-source-data.sql",
    });
    expect(sanitizerSource.command).toContain("--no-schema");
    expect(sanitizerSource.command).not.toContain("--skip-confirmation");
    expect(sanitizerSource.requiresIssue97ExecutionBoundary).toBe(true);
    expect(sanitizerSource.generalCliExecutable).toBe(false);

    const recoveryExport = buildDataOperationPlan({
      operation: "recovery-export",
      identity: identity("production"),
      repoRoot,
      gitCommit: "0123456789abcdef",
      outputPath: "tmp/data-evidence/production-recovery.sql",
    });
    expect(recoveryExport.command).not.toContain("--no-schema");
    expect(recoveryExport.command).not.toContain("--no-data");
    expect(recoveryExport.command).not.toContain("--skip-confirmation");
    expect(recoveryExport.requiresIssue97ExecutionBoundary).toBe(true);
    expect(recoveryExport.generalCliExecutable).toBe(false);

    expect(buildDataOperationPlan({
      operation: "recovery-bookmark",
      identity: identity("production"),
      repoRoot,
      gitCommit: "0123456789abcdef",
    })).toMatchObject({
      command: [
        "pnpm", "exec", "wrangler", "d1", "time-travel", "info",
        "serp-checklists-db", "--json",
      ],
      requiresIssue97ExecutionBoundary: true,
      generalCliExecutable: false,
    });

    expect(() =>
      buildDataOperationPlan({
        operation: "rehearsal-export",
        identity: identity("staging"),
        repoRoot,
        gitCommit: "0123456789abcdef",
        outputPath: "tmp/data-evidence/staging.sql",
      }),
    ).toThrow(/only.*rehearsal/i);
  });

  it("never builds fixture or import mutations for production", () => {
    for (const operation of ["fixture-setup", "fixture-teardown", "rehearsal-import", "migration-apply"]) {
      expect(() =>
        buildDataOperationPlan({
          operation,
          identity: identity("production"),
          repoRoot,
          gitCommit: "0123456789abcdef",
          importPath: "/tmp/sanitized.sql",
          importManifest: {
            classification: "approved-sanitized-production-shaped",
            sourceDate: "2026-09-04",
            sanitizerVersion: "v1",
            accessOwner: "staging-release-operator",
            retentionDeadline: "2026-09-05T00:00:00.000Z",
            sha256: "a".repeat(64),
            containsDirectIdentifiers: false,
          },
          now: new Date("2026-09-04T00:00:00.000Z"),
        }),
      ).toThrow(/production/i);
    }
  });

  it("requires exact confirmation before deleting only an allowlisted rehearsal", () => {
    const rehearsal = identity("rehearsal", {
      databaseId: rehearsalId,
      databaseName: "serp-checklists-rehearsal-issue-95",
    });

    expect(() =>
      buildDataOperationPlan({
        operation: "rehearsal-teardown",
        identity: rehearsal,
        repoRoot,
        gitCommit: "0123456789abcdef",
        confirmationDatabaseId: productionId,
      }),
    ).toThrow("must exactly match the rehearsal database ID");

    expect(
      buildDataOperationPlan({
        operation: "rehearsal-teardown",
        identity: rehearsal,
        repoRoot,
        gitCommit: "0123456789abcdef",
        confirmationDatabaseId: rehearsalId,
      }).command,
    ).toEqual([
      "pnpm",
      "exec",
      "wrangler",
      "d1",
      "delete",
      "serp-checklists-rehearsal-issue-95",
      "--skip-confirmation",
    ]);
  });

  it("creates rehearsal databases only under the reserved name prefix", () => {
    expect(() =>
      buildRehearsalCreatePlan({
        databaseName: "serp-checklists-db",
        inventory,
        repoRoot,
        gitCommit: "0123456789abcdef",
      }),
    ).toThrow(/allowlisted pattern/i);

    expect(
      buildRehearsalCreatePlan({
        databaseName: "serp-checklists-rehearsal-issue-95",
        inventory,
        repoRoot,
        gitCommit: "0123456789abcdef",
      }).command,
    ).toEqual([
      "pnpm",
      "exec",
      "wrangler",
      "d1",
      "create",
      "serp-checklists-rehearsal-issue-95",
    ]);
  });

});
