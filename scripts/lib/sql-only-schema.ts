import { readFileSync } from "node:fs";
import { z } from "zod";

const SQL_ONLY_SCHEMA_URL = new URL("../../db/sql-only-schema.json", import.meta.url);

const sqlOnlyTriggerSchema = z.object({
  name: z.string().min(1),
  table: z.string().min(1),
  definition: z.string().min(1),
});

const sqlOnlySchemaManifestSchema = z.object({
  version: z.number(),
  description: z.string(),
  triggers: z.array(sqlOnlyTriggerSchema),
});

export type SqlOnlySchemaManifest = z.infer<typeof sqlOnlySchemaManifestSchema>;

export function readSqlOnlySchema(location: URL | string = SQL_ONLY_SCHEMA_URL): SqlOnlySchemaManifest {
  const manifest = sqlOnlySchemaManifestSchema.safeParse(JSON.parse(readFileSync(location, "utf8")));
  if (!manifest.success) {
    const [issue] = manifest.error.issues;
    const where = issue ? ` (${issue.path.join(".")}: ${issue.message})` : "";
    throw new Error(`db/sql-only-schema.json must list triggers as { name, table, definition } strings${where}.`);
  }
  return manifest.data;
}
