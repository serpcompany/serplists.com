import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const wranglerToml = readFileSync(path.join(repoRoot, "wrangler.toml"), "utf8");

const productionDatabaseId = /^\s*database_id\s*=\s*"([^"]+)"\s*$/m.exec(wranglerToml)?.[1];
const previewDatabaseId = /^\s*preview_database_id\s*=\s*"([^"]+)"\s*$/m.exec(wranglerToml)?.[1];

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

console.log("Preview D1 binding points at a separate database.");
