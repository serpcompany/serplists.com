import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const wranglerToml = readFileSync(path.join(repoRoot, "wrangler.toml"), "utf8");

const productionDatabaseId = /^\s*database_id\s*=\s*"([^"]+)"\s*$/m.exec(wranglerToml)?.[1];
const previewDatabaseId = /^\s*preview_database_id\s*=\s*"([^"]+)"\s*$/m.exec(wranglerToml)?.[1];
const previewD1Block = getTomlArrayTableBlock(wranglerToml, "env.preview.d1_databases");
const previewDeploymentDatabaseId = previewD1Block
  ? /^\s*database_id\s*=\s*"([^"]+)"\s*$/m.exec(previewD1Block)?.[1]
  : undefined;

function getTomlArrayTableBlock(toml, tableName) {
  const tableHeader = `[[${tableName}]]`;
  const start = toml.indexOf(tableHeader);
  if (start === -1) return "";

  const afterHeader = start + tableHeader.length;
  const nextTableMatch = /\n\s*\[/.exec(toml.slice(afterHeader));
  if (!nextTableMatch) return toml.slice(afterHeader);

  return toml.slice(afterHeader, afterHeader + nextTableMatch.index);
}

if (!productionDatabaseId) {
  console.error("wrangler.toml is missing the production D1 database_id.");
  process.exit(1);
}

if (!previewDatabaseId || previewDatabaseId.includes("<")) {
  console.error(
    "wrangler.toml must set preview_database_id to the staging D1 UUID before preview/staging deploys.",
  );
  process.exit(1);
}

if (previewDatabaseId === productionDatabaseId) {
  console.error("preview_database_id must not match the production D1 database_id.");
  process.exit(1);
}

if (!previewDeploymentDatabaseId || previewDeploymentDatabaseId.includes("<")) {
  console.error(
    "wrangler.toml must set [[env.preview.d1_databases]] database_id to the staging D1 UUID before preview/staging deploys.",
  );
  process.exit(1);
}

if (previewDeploymentDatabaseId !== previewDatabaseId) {
  console.error(
    "[[env.preview.d1_databases]] database_id must match preview_database_id so Pages preview deploys use the staging D1 database.",
  );
  process.exit(1);
}

if (previewDeploymentDatabaseId === productionDatabaseId) {
  console.error("[[env.preview.d1_databases]] database_id must not match the production D1 database_id.");
  process.exit(1);
}

console.log("Preview D1 binding points at a separate database.");
