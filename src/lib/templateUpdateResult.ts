import { z } from "zod";

export type TemplateUpdateResult = {
  version: number;
  slug?: string;
  structureChanged?: boolean;
  reconciledRuns?: number;
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

export function parseTemplateUpdateResponse(body: unknown): TemplateUpdateResult {
  const parsed = templateUpdateResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(TEMPLATE_UPDATE_RESPONSE_ERROR);
  }
  return {
    version: parsed.data.version,
    slug: parsed.data.slug || undefined,
    structureChanged: parsed.data.structureChanged,
    reconciledRuns: parsed.data.reconciledRuns,
  };
}
