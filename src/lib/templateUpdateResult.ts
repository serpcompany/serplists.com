import { z } from "zod";

export type TemplateUpdateResult = {
  version: number;
  slug?: string | undefined;
  structureChanged?: boolean | undefined;
  reconciledRuns?: number | undefined;
};

const templateUpdateResponseSchema = z
  .object({
    version: z.number().int().positive(),
    slug: z.string().nullish(),
    structureChanged: z.boolean().optional(),
    reconciledRuns: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export const TEMPLATE_UPDATE_RESPONSE_ERROR =
  "The template was saved, but the server's answer could not be read. Reload before saving again.";

export const templateUpdateResultSchema = templateUpdateResponseSchema.transform((data): TemplateUpdateResult => ({
  version: data.version,
  slug: data.slug || undefined,
  structureChanged: data.structureChanged,
  reconciledRuns: data.reconciledRuns,
}));
