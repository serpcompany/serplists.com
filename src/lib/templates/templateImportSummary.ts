import { z } from "zod";

import { isApiError } from "@/lib/api-errors";
import type { PortableSkippedTemplate } from "@/lib/schemas/portableTemplatePack";
import { formatCount } from "@/lib/utils/pluralize";
import type { TemplateImportFailure, TemplateImportSummary } from "@/types/checklist";

export const templateImportSummarySchema = z.object({
  total: z.number(),
  imported: z.number(),
  failed: z.array(z.object({
    index: z.number(),
    title: z.string(),
    reason: z.string(),
    code: z.enum(["invalid_fields", "invalid_sections", "oversized_asset", "content_too_large", "insert_failed"]),
  })),
  successes: z.array(z.object({
    index: z.number(),
    title: z.string(),
    id: z.string(),
    slug: z.string(),
    visibility: z.enum(["public", "private"]),
  })),
}) satisfies z.ZodType<TemplateImportSummary>;

export function getImportSummaryFromError(error: unknown): TemplateImportSummary | null {
  if (!isApiError(error) || error.status !== 400 || error.code !== "template_import_failed") return null;
  const parsed = templateImportSummarySchema.safeParse(error.details);
  return parsed.success ? parsed.data : null;
}

const failureTitle = (failure: TemplateImportFailure): string => failure.title || `Template ${failure.index + 1}`;

export const formatImportFailure = (failure: TemplateImportFailure): string =>
  `${failureTitle(failure)}: ${failure.reason}`;

export function formatImportSummaryMessage(summary: TemplateImportSummary): { kind: "success" | "error"; message: string } {
  if (summary.failed.length === 0) {
    return { kind: "success", message: `Successfully imported ${summary.imported}/${summary.total} templates` };
  }
  const named = summary.failed.slice(0, 2).map(failureTitle).join(", ");
  const overflow = summary.failed.length > 2 ? ` +${summary.failed.length - 2} more` : "";
  return { kind: "error", message: `Imported ${summary.imported}/${summary.total}. Failed: ${named}${overflow}` };
}

const exportedPackSchema = z.object({
  templates: z.array(z.unknown()),
  manifest: z.object({
    skippedTemplates: z.array(z.object({ title: z.string(), reason: z.string() })).optional(),
  }).optional(),
});

export type PortableExportSummary = { exported: number; skipped: PortableSkippedTemplate[] };

export function getExportSummary(pack: unknown): PortableExportSummary {
  const { templates, manifest } = exportedPackSchema.parse(pack);
  return { exported: templates.length, skipped: manifest?.skippedTemplates ?? [] };
}

const templateCount = (count: number): string => formatCount(count, "template");

export function formatExportSummaryMessage(summary: PortableExportSummary): { kind: "success" | "warning" | "error"; message: string } {
  const { exported, skipped } = summary;
  if (skipped.length === 0) {
    return exported > 0
      ? { kind: "success", message: `Exported ${templateCount(exported)} successfully` }
      : { kind: "error", message: "No templates exported" };
  }
  const named = skipped.slice(0, 2).map(({ title, reason }) => `${title || "Untitled template"} (${reason})`).join(", ");
  const overflow = skipped.length > 2 ? ` +${skipped.length - 2} more` : "";
  const lead = exported > 0 ? `Exported ${templateCount(exported)}.` : "No templates exported.";
  return { kind: exported > 0 ? "warning" : "error", message: `${lead} Not exported: ${named}${overflow}` };
}
