import { z } from "zod";

import { isApiError } from "@/lib/api-errors";
import type { TemplateImportFailure, TemplateImportSummary } from "@/types/checklist";

// POST /api/templates/backup answers with a TemplateImportSummary. When every template
// fails it is a 400 `template_import_failed` whose `details` hold the same summary
// (docs/product-specs/portable-templates.md), so the failures can be shown either way.

const templateImportSummarySchema = z.object({
  total: z.number(),
  imported: z.number(),
  failed: z.array(z.object({
    index: z.number(),
    title: z.string(),
    reason: z.string(),
    code: z.enum(["invalid_fields", "invalid_sections", "oversized_asset", "insert_failed"]),
  })),
  successes: z.array(z.object({
    index: z.number(),
    title: z.string(),
    id: z.string(),
    slug: z.string(),
    visibility: z.enum(["public", "private"]),
  })),
}) satisfies z.ZodType<TemplateImportSummary>;

/** The per-template summary carried by an all-failed import, or null for any other error. */
export function getImportSummaryFromError(error: unknown): TemplateImportSummary | null {
  if (!isApiError(error) || error.status !== 400 || error.code !== "template_import_failed") return null;
  const parsed = templateImportSummarySchema.safeParse(error.details);
  return parsed.success ? parsed.data : null;
}

const failureTitle = (failure: TemplateImportFailure): string => failure.title || `Template ${failure.index + 1}`;

/** "Title: reason" for the Failed Templates list; an untitled template is named by position. */
export const formatImportFailure = (failure: TemplateImportFailure): string =>
  `${failureTitle(failure)}: ${failure.reason}`;

/** The toast for an import result, whether some, all, or none of its templates failed. */
export function formatImportSummaryMessage(summary: TemplateImportSummary): { kind: "success" | "error"; message: string } {
  if (summary.failed.length === 0) {
    return { kind: "success", message: `Successfully imported ${summary.imported}/${summary.total} templates` };
  }
  const named = summary.failed.slice(0, 2).map(failureTitle).join(", ");
  const overflow = summary.failed.length > 2 ? ` +${summary.failed.length - 2} more` : "";
  return { kind: "error", message: `Imported ${summary.imported}/${summary.total}. Failed: ${named}${overflow}` };
}
