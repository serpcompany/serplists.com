import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateSchemaSnapshot, replayMigrations } from "./schema-contract";

const snapshotPath = fileURLToPath(new URL("../../db/schema.sql", import.meta.url));
const database = replayMigrations();
const generated = generateSchemaSnapshot(database);
database.close();

if (process.argv.includes("--check")) {
  const current = readFileSync(snapshotPath, "utf8");
  if (current !== generated) {
    console.error("db/schema.sql is stale. Run `pnpm run db:schema:snapshot` after changing migrations.");
    process.exit(1);
  }
  console.log("db/schema.sql matches the complete Wrangler migration chain.");
} else {
  writeFileSync(snapshotPath, generated);
  console.log("Generated db/schema.sql from the complete Wrangler migration chain.");
}
