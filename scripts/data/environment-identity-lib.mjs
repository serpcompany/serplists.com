import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIGRATION_PATTERN = /^\d{4}_.+\.sql$/;

function readTomlArrayTable(toml, tableName) {
  const header = `[[${tableName}]]`;
  const start = toml.indexOf(header);
  if (start < 0) return "";
  const contentStart = start + header.length;
  const nextTable = /\n\s*\[/.exec(toml.slice(contentStart));
  return toml.slice(
    contentStart,
    nextTable ? contentStart + nextTable.index : undefined,
  );
}

function readTomlString(block, key) {
  return new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"\\s*$`, "m").exec(block)?.[1];
}

export function loadEnvironmentInventory({ repoRoot }) {
  return JSON.parse(
    readFileSync(path.join(repoRoot, "scripts/data/environment-inventory.json"), "utf8"),
  );
}

export function validateEnvironmentInventory({ inventory, wranglerToml }) {
  if (inventory?.schemaVersion !== 1 || inventory?.binding !== "DB") {
    throw new Error("Environment inventory must use schemaVersion 1 and the DB binding.");
  }

  const productionBlock = readTomlArrayTable(wranglerToml, "env.production.d1_databases");
  const stagingBlock = readTomlArrayTable(wranglerToml, "env.preview.d1_databases");
  const defaultBlock = readTomlArrayTable(wranglerToml, "d1_databases");
  const productionDatabaseId = readTomlString(productionBlock, "database_id");
  const stagingDatabaseId = readTomlString(stagingBlock, "database_id");
  const productionDatabaseName = readTomlString(productionBlock, "database_name");
  const stagingDatabaseName = readTomlString(stagingBlock, "database_name");
  const defaultDatabaseId = readTomlString(defaultBlock, "database_id");
  const topLevelPreviewDatabaseId = readTomlString(defaultBlock, "preview_database_id");

  if (!UUID_PATTERN.test(productionDatabaseId ?? "")) {
    throw new Error("Wrangler production D1 database_id is missing or invalid.");
  }
  if (!UUID_PATTERN.test(stagingDatabaseId ?? "")) {
    throw new Error("Wrangler preview D1 database_id is missing or invalid.");
  }
  if (productionDatabaseId === stagingDatabaseId) {
    throw new Error("Wrangler preview D1 resolves to the production database ID.");
  }
  if (defaultDatabaseId !== productionDatabaseId) {
    throw new Error("Top-level D1 database_id must match the production environment database ID.");
  }
  if (topLevelPreviewDatabaseId !== stagingDatabaseId) {
    throw new Error("Top-level preview_database_id must match the staging environment database ID.");
  }

  const production = inventory.environments?.production;
  const staging = inventory.environments?.staging;
  if (
    production?.databaseId !== productionDatabaseId ||
    production?.databaseName !== productionDatabaseName
  ) {
    throw new Error("Production inventory does not match wrangler.toml.");
  }
  if (staging?.databaseId !== stagingDatabaseId || staging?.databaseName !== stagingDatabaseName) {
    throw new Error("Staging inventory does not match wrangler.toml.");
  }

  const staticIdentities = new Map();
  for (const [environment, entry] of Object.entries(inventory.environments ?? {})) {
    for (const field of ["databaseName", "databaseId", "purpose", "migrationLevel", "dataClassification", "owner"]) {
      if (!entry[field]) throw new Error(`${environment} inventory is missing ${field}.`);
    }
    if (environment !== "production" && entry.databaseId === productionDatabaseId) {
      throw new Error(`${environment} inventory resolves to the production database ID.`);
    }
    if (entry.databaseId !== "runtime-required") {
      const previousEnvironment = staticIdentities.get(entry.databaseId);
      if (previousEnvironment) {
        throw new Error(
          `Duplicate database identity in inventory: ${previousEnvironment} and ${environment}.`,
        );
      }
      staticIdentities.set(entry.databaseId, environment);
    }
  }

  return { productionDatabaseId, stagingDatabaseId };
}

export function resolveEnvironmentIdentity({
  environment,
  inventory,
  databaseId,
  databaseName,
}) {
  const entry = inventory.environments?.[environment];
  if (!entry) throw new Error(`Unknown data environment: ${environment ?? "missing"}.`);

  const resolvedDatabaseId = databaseId ?? entry.databaseId;
  const resolvedDatabaseName = databaseName ?? entry.databaseName;
  const productionDatabaseId = inventory.environments.production.databaseId;

  if (environment !== "production" && resolvedDatabaseId === productionDatabaseId) {
    throw new Error(`${environment} operation refused: target is the production database ID.`);
  }

  if (environment === "rehearsal") {
    if (!databaseId) throw new Error("Rehearsal operations require --database-id.");
    if (!databaseName) throw new Error("Rehearsal operations require --database-name.");
    if (databaseId === inventory.environments.staging.databaseId) {
      throw new Error("Rehearsal operation refused: target is the staging database ID.");
    }
    if (!UUID_PATTERN.test(databaseId)) throw new Error("Rehearsal database ID must be an exact D1 UUID.");
    if (!new RegExp(entry.databaseNamePattern).test(databaseName)) {
      throw new Error(`Rehearsal database name is outside the allowlisted pattern: ${databaseName}.`);
    }
  } else if (databaseId && databaseId !== entry.databaseId) {
    throw new Error(`${environment} database ID does not match the checked-in inventory.`);
  } else if (databaseName && databaseName !== entry.databaseName) {
    throw new Error(`${environment} database name does not match the checked-in inventory.`);
  }

  return {
    environment,
    binding: inventory.binding,
    databaseName: resolvedDatabaseName,
    databaseId: resolvedDatabaseId,
    purpose: entry.purpose,
    migrationLevel: entry.migrationLevel,
    dataClassification: entry.dataClassification,
    owner: entry.owner,
    isRemote: entry.isRemote,
  };
}

export function getRepositoryMigrationRange({ repoRoot }) {
  const files = readdirSync(path.join(repoRoot, "db/migrations"))
    .filter((fileName) => MIGRATION_PATTERN.test(fileName))
    .sort((left, right) => left.localeCompare(right));
  if (files.length === 0) throw new Error("No numbered D1 migrations were found.");
  return { first: files[0], latest: files.at(-1), count: files.length };
}

// Direct read checks share the inventory boundary, not production write authority.
export function resolveDirectCheckIdentity({ repoRoot, environment, binding = 'DB', databaseName, databaseId, local, remote, preview, persistTo, argv = process.argv.slice(2) }) {
  const values = new Set(['--database', '--database-id', '--label', '--binding', '--persist-to', '--report-dir']);
  const flags = new Set(['--local', '--remote', '--preview']);
  const seen = new Set();
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    // pnpm run forwards its package separator. Consume it once without ending
    // validation: duplicates and unknown/missing options on either side fail.
    if (argument === '--' && !seen.has('--')) {
      seen.add('--');
      continue;
    }
    const option = argument.split('=')[0];
    if (seen.has(option) || (!values.has(option) && !flags.has(option)) || (flags.has(option) && argument !== option)) {
      throw new Error('Direct check arguments are unknown, duplicated, or ambiguous.');
    }
    seen.add(option);
    if (values.has(option)) {
      const value = argument.includes('=') ? argument.slice(option.length + 1) : argv[++index];
      if (!value || value.startsWith('--')) throw new Error('Direct check argument value is missing.');
    }
  }
  const inventory = loadEnvironmentInventory({ repoRoot });
  const wranglerToml = readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
  validateEnvironmentInventory({ inventory, wranglerToml });
  if (binding !== inventory.binding || ['d1_databases', 'env.preview.d1_databases', 'env.production.d1_databases']
    .some(table => readTomlString(readTomlArrayTable(wranglerToml, table), 'binding') !== binding)) {
    throw new Error('Direct check binding does not match the configured inventory.');
  }
  if (local === remote || local !== (environment === 'local') || (preview && environment !== 'staging') || (persistTo != null && !local)) {
    throw new Error('Direct check mode does not match the configured environment.');
  }
  if (environment === 'production' && !databaseId) throw new Error('Production checks require an explicit exact database UUID.');
  const identity = resolveEnvironmentIdentity({ environment, inventory, databaseName, databaseId });
  if (identity.isRemote !== remote) throw new Error('Direct check mode does not match the inventory.');
  return identity;
}

/** @param {{ expected: { databaseName: string, databaseId: string }, observed: { databaseName: string, databaseId: string } }} options */
export function validateDirectCheckObservation({ expected, observed }) {
  if (observed.databaseName !== expected.databaseName || observed.databaseId !== expected.databaseId) {
    throw new Error('Observed D1 identity does not match the configured environment.');
  }
  return observed;
}
