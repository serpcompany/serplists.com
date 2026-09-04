import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as drizzleSchema from "../../db/schema/index";
import { buildDrizzleContract, contractFingerprint, inspectDatabase, listMigrationFiles, replayMigrations, validateContractCorrection } from "./schema-contract";
import { writeDataCheckReports } from "./reporting.mjs";

function arg(name: string) { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; }
const reportDirectory = arg("--report-dir") ?? process.env.DATA_REPORT_DIR ?? "tmp/data-reports";
try {
  const fixture = arg("--changed-files-file");
  const manifestPath = arg("--manifest") ?? new URL("./contract-corrections.json", import.meta.url);
  let changed: string[];
  let comparisonBase: string | null = null;
  const eventName = process.env.GITHUB_EVENT_NAME ?? "local-working-tree";
  if (fixture) {
    comparisonBase = arg("--base-ref");
    if (!comparisonBase) throw new Error("Changed-files fixture requires an explicit comparison base.");
    changed = readFileSync(fixture, "utf8").trim().split(/\r?\n/).filter(Boolean);
  }
  else {
    if (process.env.GITHUB_ACTIONS === "true") {
      comparisonBase = process.env.SCHEMA_CONTRACT_BASE_SHA ?? null;
      if (!comparisonBase || /^0+$/.test(comparisonBase)) throw new Error(`GitHub ${eventName} schema check requires a trustworthy comparison base SHA.`);
    } else comparisonBase = "HEAD";
    execFileSync("git", ["rev-parse", "--verify", comparisonBase], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    changed = execFileSync("git", ["diff", "--name-only", `${comparisonBase}...HEAD`], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
    if (eventName === "local-working-tree") {
      const working = execFileSync("git", ["diff", "--name-only", "HEAD"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
      changed = [...new Set([...changed, ...working])];
    }
  }
  const schemaFiles = changed.filter((file) => file.startsWith("db/schema/") && file.endsWith(".ts"));
  const migrationFiles = changed.filter((file) => file.startsWith("db/migrations/") && file.endsWith(".sql"));
  if (schemaFiles.length && !migrationFiles.length) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (schemaFiles.some((file) => !manifest.allowedFiles.includes(file))) throw new Error("Drizzle-only change is outside the contract-correction manifest.");
    const migrations = listMigrationFiles().map((migration) => migration.name);
    const baseRef = comparisonBase;
    if (!baseRef) throw new Error("Contract correction requires a complete, fetchable base ref.");
    execFileSync("git", ["rev-parse", "--verify", baseRef], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const contract = buildDrizzleContract(drizzleSchema);
    if (contractFingerprint(contract) !== manifest.contractFingerprint) throw new Error("Drizzle contract does not match the approved correction fingerprint.");
    for (const property of manifest.properties ?? []) {
      if (!property.table || !property.column || !["affinity", "notNull", "defaultValue", "primaryKey"].includes(property.attribute) || !migrations.includes(property.creatingMigration)) {
        throw new Error("Contract-correction property mapping is malformed or references an unknown migration.");
      }
      execFileSync("git", ["cat-file", "-e", `${baseRef}:db/migrations/${property.creatingMigration}`], { stdio: ["ignore", "pipe", "pipe"] });
      const creatingIndex = migrations.indexOf(property.creatingMigration);
      let beforeValue: unknown = undefined;
      if (creatingIndex > 0) {
        const before = replayMigrations({ through: migrations[creatingIndex - 1] });
        try {
          const column = inspectDatabase(before).tables[property.table]?.columns.find((candidate) => candidate.name === property.column);
          beforeValue = property.attribute === "affinity" ? column?.type : column?.[property.attribute as "notNull" | "defaultValue" | "primaryKey"];
        } finally { before.close(); }
      }
      if (beforeValue === property.expectedValue) throw new Error(`Migration ${property.creatingMigration} is not the creating migration for ${property.table}.${property.column}.${property.attribute}.`);
      const historical = replayMigrations({ through: property.creatingMigration });
      try {
        const column = inspectDatabase(historical).tables[property.table]?.columns.find((candidate) => candidate.name === property.column);
        const actualValue = property.attribute === "affinity"
          ? column?.type
          : column?.[property.attribute as "notNull" | "defaultValue" | "primaryKey"];
        if (actualValue !== property.expectedValue) throw new Error(`Creating migration ${property.creatingMigration} did not establish ${property.table}.${property.column}.${property.attribute}=${JSON.stringify(property.expectedValue)}.`);
      } finally { historical.close(); }
      const contractColumn = contract.tables[property.table]?.columns.find((candidate) => candidate.name === property.column);
      if (contractColumn?.[property.attribute as keyof typeof contractColumn] !== property.expectedValue) throw new Error(`Corrected Drizzle value does not match mapping for ${property.table}.${property.column}.${property.attribute}.`);
    }
    const database = replayMigrations({ through: manifest.appliedThrough });
    try { validateContractCorrection({ contract, migratedCatalog: inspectDatabase(database), changedMigrationFiles: [], appliedMigrationEvidence: migrations.slice(0, migrations.indexOf(manifest.appliedThrough) + 1) }); } finally { database.close(); }
  }
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const report = { check: "contract-correction", verdict: "pass", commit, eventName, comparisonBase, changedFiles: changed };
  writeDataCheckReports({ name: "contract-correction", report, summary: "PASS contract-correction policy.", reportDirectory });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  writeDataCheckReports({ name: "contract-correction", report: { check: "contract-correction", verdict: "fail", error: message }, summary: `BLOCKED contract correction: ${message}`, reportDirectory });
  console.error(message); process.exitCode = 1;
}
