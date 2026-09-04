import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { getRepositoryMigrationRange } from "./environment-identity-lib.mjs";
import { selectInvariantSqlFiles } from "./invariant-capture-lib.mjs";
import {
  loadSanitizerPolicy,
  validateSanitizedRehearsalArtifact,
} from "./sanitizer-lib.mjs";

const MUTATING_OPERATIONS = new Set([
  "fixture-setup",
  "fixture-teardown",
  "migration-apply",
  "rehearsal-baseline",
  "rehearsal-import",
  "recovery-restore",
  "rehearsal-teardown",
]);
const PRODUCTION_PLAN_ONLY_OPERATIONS = new Set([
  "export",
  "recovery-bookmark",
  "recovery-export",
  "sanitizer-source-export",
]);

function wranglerTargetArgs(identity, persistTo) {
  if (!identity.isRemote) {
    return [identity.databaseName, "--local", ...(persistTo ? ["--persist-to", persistTo] : [])];
  }
  if (identity.environment === "staging") return [identity.binding, "--remote", "--preview"];
  return [identity.databaseName, "--remote"];
}

function commandForSql(identity, filePath, persistTo) {
  const [database, ...mode] = wranglerTargetArgs(identity, persistTo);
  return ["pnpm", "exec", "wrangler", "d1", "execute", database, ...mode, "--file", filePath, "--yes", "--json"];
}

function commandForQuery(identity, sql, persistTo) {
  const [database, ...mode] = wranglerTargetArgs(identity, persistTo);
  return [
    "pnpm", "exec", "wrangler", "d1", "execute", database, ...mode,
    "--command", sql, "--json",
  ];
}

function reportFor({ operation, identity, repoRoot, gitCommit }) {
  return {
    operation,
    environment: identity.environment,
    binding: identity.binding,
    databaseName: identity.databaseName,
    databaseId: identity.databaseId,
    purpose: identity.purpose,
    dataClassification: identity.dataClassification,
    owner: identity.owner,
    gitCommit,
    migrationRange: getRepositoryMigrationRange({ repoRoot }),
  };
}

export function buildRehearsalCreatePlan({ databaseName, inventory, repoRoot, gitCommit }) {
  const rehearsal = inventory.environments.rehearsal;
  if (!new RegExp(rehearsal.databaseNamePattern).test(databaseName ?? "")) {
    throw new Error(`Rehearsal database name is outside the allowlisted pattern: ${databaseName ?? "missing"}.`);
  }
  if (databaseName === inventory.environments.production.databaseName) {
    throw new Error("Rehearsal creation refused for the production database name.");
  }
  return {
    report: reportFor({
      operation: "rehearsal-create",
      identity: {
        environment: "rehearsal",
        binding: inventory.binding,
        databaseName,
        databaseId: "assigned-by-cloudflare-after-create",
        purpose: rehearsal.purpose,
        dataClassification: rehearsal.dataClassification,
        owner: rehearsal.owner,
      },
      repoRoot,
      gitCommit,
    }),
    command: ["pnpm", "exec", "wrangler", "d1", "create", databaseName],
    mutates: true,
  };
}

export function buildDataOperationPlan({
  operation,
  identity,
  repoRoot,
  gitCommit,
  outputPath,
  importPath,
  importSql,
  importManifest,
  confirmationDatabaseId,
  persistTo,
  beforeMigration,
  now = new Date(),
}) {
  if (identity.environment === "production" && MUTATING_OPERATIONS.has(operation)) {
    throw new Error(`${operation} is forbidden for production; use the protected production workflow.`);
  }

  let resolvedPersistTo;
  if (persistTo) {
    if (identity.isRemote) throw new Error("--persist-to is allowed only for local D1 operations.");
    const allowedRoot = path.join(repoRoot, ".wrangler/rehearsals");
    resolvedPersistTo = path.resolve(repoRoot, persistTo);
    if (resolvedPersistTo !== allowedRoot && !resolvedPersistTo.startsWith(`${allowedRoot}${path.sep}`)) {
      throw new Error("Local rehearsal state must stay under .wrangler/rehearsals/.");
    }
  }

  const report = reportFor({ operation, identity, repoRoot, gitCommit });
  if (resolvedPersistTo) {
    report.databaseId = `${identity.databaseId}@${path.relative(repoRoot, resolvedPersistTo)}`;
    report.persistencePath = resolvedPersistTo;
  }
  const preflightCommand = identity.isRemote
    ? ["pnpm", "exec", "wrangler", "d1", "info", identity.databaseName, "--json"]
    : null;
  let command;
  let invariantLedgerCommand;
  let versionedInvariantCommands = [];
  let outputPathForReport;
  let rawOutputPath;
  let commands;
  let preconditionCommand;
  let expectedAppliedMigrations;

  switch (operation) {
    case "identify":
      command = preflightCommand;
      break;
    case "recovery-bookmark":
      if (!identity.isRemote) throw new Error("D1 Time Travel bookmarks are available only for remote databases.");
      command = ["pnpm", "exec", "wrangler", "d1", "time-travel", "info", identity.databaseName, "--json"];
      break;
    case "migration-ledger": {
      const [database, ...mode] = wranglerTargetArgs(identity, resolvedPersistTo);
      command = ["pnpm", "exec", "wrangler", "d1", "migrations", "list", database, ...mode];
      break;
    }
    case "migration-apply": {
      const [database, ...mode] = wranglerTargetArgs(identity, resolvedPersistTo);
      command = ["pnpm", "exec", "wrangler", "d1", "migrations", "apply", database, ...mode];
      break;
    }
    case "rehearsal-baseline": {
      if (identity.environment !== "rehearsal" || !identity.isRemote) {
        throw new Error("A migration baseline may be built only in an isolated remote rehearsal database.");
      }
      const migrationFiles = readdirSync(path.join(repoRoot, "db/migrations"))
        .filter((name) => /^\d{4}_.+\.sql$/.test(name))
        .sort((left, right) => left.localeCompare(right, "en"));
      if (!beforeMigration) throw new Error("Rehearsal baseline requires --before <migration filename|none>.");
      const boundary = beforeMigration === "none" ? migrationFiles.length : migrationFiles.indexOf(beforeMigration);
      if (boundary < 0) throw new Error(`Rehearsal baseline boundary is not a repository migration: ${beforeMigration}.`);
      expectedAppliedMigrations = migrationFiles.slice(0, boundary);
      preconditionCommand = commandForQuery(
        identity,
        "SELECT COUNT(*) AS total_objects FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name <> 'd1_migrations'",
      );
      const ledgerSetup = commandForQuery(identity, "CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)");
      commands = [ledgerSetup];
      for (const fileName of expectedAppliedMigrations) {
        commands.push(commandForSql(identity, path.join(repoRoot, "db/migrations", fileName)));
        commands.push(commandForQuery(identity, `INSERT INTO d1_migrations (name) VALUES ('${fileName}')`));
      }
      invariantLedgerCommand = commandForQuery(identity, "SELECT id, name FROM d1_migrations ORDER BY id");
      report.baseline = { beforeMigration, appliedMigrations: expectedAppliedMigrations };
      break;
    }
    case "export":
    case "rehearsal-export":
    case "sanitizer-source-export":
    case "recovery-export": {
      if (operation === "rehearsal-export" && identity.environment !== "rehearsal") {
        throw new Error("Data export is allowed only from an approved sanitized rehearsal database.");
      }
      if (operation === "recovery-export" && identity.environment !== "production") {
        throw new Error("Recovery export is reserved for the protected production workflow.");
      }
      if (operation === "sanitizer-source-export" && identity.environment !== "production") {
        throw new Error("Sanitizer source export is reserved for the protected production workflow.");
      }
      if (!outputPath) throw new Error("Export requires --output under tmp/data-evidence/.");
      const allowedRoot = path.resolve(repoRoot, "tmp/data-evidence");
      const resolvedOutput = path.resolve(repoRoot, outputPath);
      if (resolvedOutput !== allowedRoot && !resolvedOutput.startsWith(`${allowedRoot}${path.sep}`)) {
        throw new Error("Export output must stay under ignored tmp/data-evidence/.");
      }
      if (resolvedPersistTo) throw new Error("Wrangler local export does not support --persist-to.");
      const [database, ...mode] = wranglerTargetArgs(identity);
      outputPathForReport = resolvedOutput;
      rawOutputPath = operation === "rehearsal-export"
        ? `${resolvedOutput}.wrangler-raw.sql`
        : resolvedOutput;
      command = [
        "pnpm", "exec", "wrangler", "d1", "export", database, ...mode,
        "--output", rawOutputPath,
        ...(operation === "export" ? ["--no-data"] : []),
        ...(["rehearsal-export", "sanitizer-source-export"].includes(operation)
          ? ["--no-schema"]
          : []),
      ];
      break;
    }
    case "invariant-capture": {
      command = commandForSql(identity, path.join(repoRoot, "scripts/data/sql/capture-invariants.sql"), resolvedPersistTo);
      invariantLedgerCommand = commandForQuery(
        identity,
        "SELECT id, name FROM d1_migrations ORDER BY id",
        resolvedPersistTo,
      );
      versionedInvariantCommands = selectInvariantSqlFiles({
        appliedMigrations: ["0024_safe_template_evolution.sql"],
      }).slice(1).map((definition) => ({
        minimumMigration: definition.minimumMigration,
        command: commandForSql(identity, definition.path, resolvedPersistTo),
      }));
      break;
    }
    case "fixture-setup":
    case "fixture-teardown": {
      const fixtureInventory = JSON.parse(
        readFileSync(path.join(repoRoot, "scripts/data/fixture-inventory.json"), "utf8"),
      );
      if (!fixtureInventory.allowedEnvironments.includes(identity.environment)) {
        throw new Error(`Fixtures are not allowed in ${identity.environment}.`);
      }
      const sqlField = operation === "fixture-setup" ? "setupSql" : "teardownSql";
      command = commandForSql(identity, path.join(repoRoot, fixtureInventory[sqlField]), resolvedPersistTo);
      report.fixtureSet = fixtureInventory.fixtureSet;
      report.expectedCounts = operation === "fixture-teardown"
        ? { users: 0, templates: 0, checklistRuns: 0 }
        : fixtureInventory.expectedCounts;
      break;
    }
    case "rehearsal-import":
      if (identity.environment !== "rehearsal") {
        throw new Error("Sanitized imports may target only an isolated rehearsal database.");
      }
      if (!importPath) throw new Error("Rehearsal import requires --input.");
      validateSanitizedRehearsalArtifact({
        sql: importSql,
        manifest: importManifest,
        policy: loadSanitizerPolicy({ repoRoot }),
        now,
      });
      command = commandForSql(identity, path.resolve(importPath), resolvedPersistTo);
      report.sanitizedImport = {
        sourceDate: importManifest.provenance.sourceDate,
        sanitizerVersion: importManifest.sanitizerVersion,
        sourceExportSha256: importManifest.provenance.sourceExportSha256,
        requestedApproverIdentity: importManifest.requestMetadata.requestedApproverIdentity,
        retentionDeadline: importManifest.retentionDeadline,
        sha256: importManifest.artifact.sha256,
        manifestIntegritySha256: importManifest.manifestIntegritySha256,
      };
      break;
    case "recovery-restore": {
      if (identity.environment !== "rehearsal") {
        throw new Error("Recovery restore may target only an isolated rehearsal database.");
      }
      if (!importPath) throw new Error("Recovery restore requires --input.");
      const allowedRoot = path.resolve(repoRoot, "tmp/rehearsal-sensitive");
      const resolvedInput = path.resolve(repoRoot, importPath);
      if (resolvedInput !== allowedRoot && !resolvedInput.startsWith(`${allowedRoot}${path.sep}`)) {
        throw new Error("Recovery plaintext must stay under non-artifact tmp/rehearsal-sensitive/.");
      }
      command = commandForSql(identity, resolvedInput, resolvedPersistTo);
      report.recoveryRestore = { plaintextRetention: "delete-after-restore", artifactUpload: "forbidden" };
      break;
    }
    case "rehearsal-teardown":
      if (identity.environment !== "rehearsal") {
        throw new Error("Rehearsal teardown may delete only an isolated rehearsal database.");
      }
      if (confirmationDatabaseId !== identity.databaseId) {
        throw new Error("--confirm-database-id must exactly match the rehearsal database ID.");
      }
      command = ["pnpm", "exec", "wrangler", "d1", "delete", identity.databaseName, "--skip-confirmation"];
      break;
    default:
      throw new Error(`Unknown data operation: ${operation}.`);
  }

  return {
    report,
    preflightCommand,
    command,
    commands,
    preconditionCommand,
    expectedAppliedMigrations,
    invariantLedgerCommand,
    versionedInvariantCommands,
    outputPath: outputPathForReport,
    rawOutputPath,
    mutates: MUTATING_OPERATIONS.has(operation),
    requiresConfirmation: operation === "rehearsal-export",
    requiresWorkflowRequestContext:
      operation === "rehearsal-export" || operation === "rehearsal-import" || operation === "recovery-restore" || operation === "rehearsal-baseline",
    requiresStagingExecutionBoundary:
      identity.environment === "staging" && MUTATING_OPERATIONS.has(operation),
    requiresIssue97ExecutionBoundary:
      identity.environment === "production" &&
      PRODUCTION_PLAN_ONLY_OPERATIONS.has(operation),
    generalCliExecutable: !(
      identity.environment === "production" &&
      PRODUCTION_PLAN_ONLY_OPERATIONS.has(operation)
    ),
  };
}
