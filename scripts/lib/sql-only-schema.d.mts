import type { z } from "zod";

export const sqlOnlySchemaManifestSchema: z.ZodObject<{
  version: z.ZodNumber;
  description: z.ZodString;
  triggers: z.ZodArray<z.ZodObject<{ name: z.ZodString; table: z.ZodString; definition: z.ZodString }>>;
}>;

export type SqlOnlySchemaManifest = z.infer<typeof sqlOnlySchemaManifestSchema>;

export function readSqlOnlySchema(location?: URL | string): SqlOnlySchemaManifest;
