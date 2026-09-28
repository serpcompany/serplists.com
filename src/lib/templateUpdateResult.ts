import { z } from "zod";

// PUT /api/templates/:id answers with the version and slug it stored. The next save sends
// that version as expected_version (never a local +1: some edits keep the version), and the
// slug may carry a -<id8> suffix when the requested one was taken.
export type TemplateUpdateResult = {
  version: number;
  slug?: string;
};

const templateUpdateResponseSchema = z
  .object({
    version: z.number().int().positive(),
    slug: z.string().nullish(),
  })
  .passthrough();

export const TEMPLATE_UPDATE_RESPONSE_ERROR =
  "The template was saved, but the server's answer could not be read. Reload before saving again.";

export function parseTemplateUpdateResponse(body: unknown): TemplateUpdateResult {
  const parsed = templateUpdateResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(TEMPLATE_UPDATE_RESPONSE_ERROR);
  }
  return { version: parsed.data.version, slug: parsed.data.slug || undefined };
}
