import { zodToJsonSchema } from "zod-to-json-schema";
import {
  PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
  portableTemplatePackSchema,
} from "./checklistSchema";

export const PORTABLE_TEMPLATE_PACK_JSON_SCHEMA_RELATIVE_PATH = "docs/schema/portable-template-pack.schema.json";
export const PORTABLE_TEMPLATE_PACK_JSON_SCHEMA_ID = "https://serplists.com/schema/portable-template-pack.schema.json";

export const buildPortableTemplatePackJsonSchema = () => {
  const jsonSchema = zodToJsonSchema(portableTemplatePackSchema, {
    $refStrategy: "none",
    name: "SERPListsPortableTemplatePack",
    nameStrategy: "title",
  });

  return {
    ...jsonSchema,
    $id: PORTABLE_TEMPLATE_PACK_JSON_SCHEMA_ID,
    title: `SERP Lists Portable Template Pack v${PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION}`,
    description: "Canonical portable SERP Lists template-pack contract generated from the Zod source of truth.",
  };
};
