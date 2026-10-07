import { z } from "zod";

import { readableRowsOf } from "./apiResponses";
import { portableTemplateRuleSchema } from "./checklistSchema";
import { requiredToolsSchema } from "./requiredTools";
import { templateOwnerSchema } from "./templateOwner";

const text = z.string().nullish();
const storedFlag = z.union([z.boolean(), z.number()]).nullish();

export const apiTemplateSchema = z.object({
  id: z.string(),
  title: z.string(),
  user_id: text,
  description: text,
  type: text,
  version: z.number().nullish(),
  content_version: z.number().nullish(),
  owner_type: text,
  team_id: text,
  teamId: text,
  is_public: storedFlag,
  slug: text,
  seoTitle: text,
  seoDescription: text,
  seoUrl: text,
  rules: z.array(portableTemplateRuleSchema).nullish(),
  requiredTools: requiredToolsSchema.optional().catch(undefined),
  sections: z.unknown(),
  items: z.unknown(),
  categories: z.array(z.string()).nullish(),
  category: text,
  tags: z.union([z.array(z.string()), z.string()]).nullish(),
  created_at: text,
  updated_at: text,
  deleted_at: text,
  owner_username: text,
  owner_full_name: text,
  owner: templateOwnerSchema.optional().catch(undefined),
});

export const apiTemplateListSchema = readableRowsOf(apiTemplateSchema);

export const savedTemplateSchema = z.object({ id: z.string(), slug: z.string().nullish() });

export const templateTransferredSchema = z.object({ success: z.literal(true), id: z.string(), teamId: z.string(), version: z.number() });

export const exportedTemplatePackSchema = z.object({ templates: z.array(z.unknown()) }).passthrough();

export const publicRequiredToolsSchema = z.array(z.object({ id: z.string(), requiredTools: requiredToolsSchema }));

export type ApiTemplate = z.infer<typeof apiTemplateSchema>;
export type SavedTemplate = z.infer<typeof savedTemplateSchema>;
export type ExportedTemplatePack = z.infer<typeof exportedTemplatePackSchema>;
export type PublicRequiredTools = z.infer<typeof publicRequiredToolsSchema>;
