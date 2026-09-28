import { z } from "zod";
import {
  RUN_TITLE_MAX,
  TEMPLATE_DESCRIPTION_MAX,
  TEMPLATE_LIST_ITEM_MAX,
  TEMPLATE_LIST_MAX_ITEMS,
  TEMPLATE_SEO_DESCRIPTION_MAX,
  TEMPLATE_SEO_TITLE_MAX,
  TEMPLATE_SLUG_MAX,
  TEMPLATE_TITLE_MAX,
} from "../../../src/lib/schemas/templateLimits";
import { findStoredSectionsIssue } from "../../../src/lib/schemas/storedSections";

const boundedOptionalString = (max: number) => z.string().trim().max(max).optional();
const boundedRequiredString = (max: number) => z.string().trim().min(1).max(max);
const stringListField = (maxItems: number, maxLength: number) =>
  z
    .union([
      z.array(z.string().trim().min(1).max(maxLength)).max(maxItems),
      z.string().trim().min(1).max(maxLength),
    ])
    .optional();
const templateRuleSchema = z.object({
  id: z.string().trim().min(1),
  type: z.string().trim().min(1),
  path: z.string().trim().min(1),
  value: z.unknown().optional(),
  severity: z.enum(["error", "warning"]).optional(),
});

export const templatePayloadSchema = z.object({
  teamId: z.string().trim().min(1).optional(),
  team_id: z.string().trim().min(1).optional(),
  title: boundedRequiredString(TEMPLATE_TITLE_MAX).optional(),
  description: boundedOptionalString(TEMPLATE_DESCRIPTION_MAX),
  type: z.enum(["checklist", "recipe"]).optional(),
  seoTitle: boundedOptionalString(TEMPLATE_SEO_TITLE_MAX),
  seoDescription: boundedOptionalString(TEMPLATE_SEO_DESCRIPTION_MAX),
  rules: z.array(templateRuleSchema).optional(),
  is_public: z.boolean().optional(),
  categories: stringListField(TEMPLATE_LIST_MAX_ITEMS, TEMPLATE_LIST_ITEM_MAX),
  category: boundedOptionalString(TEMPLATE_LIST_ITEM_MAX),
  tags: stringListField(TEMPLATE_LIST_MAX_ITEMS, TEMPLATE_LIST_ITEM_MAX),
  sections: z.unknown().optional(),
  items: z.unknown().optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(TEMPLATE_SLUG_MAX)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase letters, numbers, and hyphens only")
    .optional(),
  expected_version: z.number().int().positive().optional(),
});

// Saves resend every stored field, and stored values can predate these bounds (imports,
// clones, legacy slugs). So PUT checks only types on the wire; the handler validates the
// fields that actually change against templatePayloadSchema once it has read the row,
// and normalizes a changed slug instead of rejecting it.
const looseStringList = z.union([z.array(z.string().trim()), z.string().trim()]).optional();
export const templateUpdatePayloadSchema = templatePayloadSchema.extend({
  title: z.string().trim().optional(),
  description: z.string().trim().optional(),
  seoTitle: z.string().trim().optional(),
  seoDescription: z.string().trim().optional(),
  rules: z.array(templateRuleSchema.extend({ id: z.string().trim(), type: z.string().trim(), path: z.string().trim() })).optional(),
  categories: looseStringList,
  category: z.string().trim().optional(),
  tags: looseStringList,
  slug: z.string().trim().optional(),
});

// Import files are free-form; each template's fields must fit the same bounds as a save.
export const templateImportFieldsSchema = templatePayloadSchema
  .pick({ title: true, description: true, seoTitle: true, seoDescription: true, categories: true, tags: true, rules: true })
  .required({ title: true });

/** An error message that names the field: "description: String must contain at most 5000 character(s)". */
export function formatPayloadIssue(error: z.ZodError, fallback: string): string {
  const issue = error.issues[0];
  if (!issue) return fallback;
  return `${issue.path.join(".") || "payload"}: ${issue.message}`;
}

export const checklistPayloadSchema = z.object({
  teamId: z.string().trim().min(1).optional(),
  team_id: z.string().trim().min(1).optional(),
  template_id: z.string().trim().min(1).nullable().optional(),
  title: boundedRequiredString(RUN_TITLE_MAX).optional(),
  sections: z.unknown().optional(),
  items: z.unknown().optional(),
  status: z.enum(["in_progress", "completed"]).optional(),
  progress: z.number().min(0).max(100).optional(),
  completed_at: z.string().datetime().nullable().optional(),
  expected_revision: z.number().int().positive().optional(),
});

export function parseJsonArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function normalizeStringArray(value: unknown): string[] {
  const parsed = parseJsonArray(value);
  if (parsed) {
    return parsed.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
  }
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

/**
 * normalizeSectionsPayload for writes: also checks every section, task, content block and
 * Sub-task against storedSectionsSchema, so stored content never breaks a reader. The
 * error names the first bad path.
 */
export function parseSectionsPayload(input: unknown): { sections: unknown[]; error?: string } {
  const normalized = normalizeSectionsPayload(input);
  if (normalized.error) return normalized;
  const issue = findStoredSectionsIssue(normalized.sections);
  return issue ? { sections: [], error: issue } : normalized;
}

export function normalizeSectionsPayload(input: unknown): { sections: unknown[]; error?: string } {
  if (input === undefined || input === null) return { sections: [] };

  const parsed = parseJsonArray(input);
  if (!parsed) {
    return { sections: [], error: "sections/items must be a JSON array" };
  }

  if (parsed.length === 0) return { sections: [] };

  const first = parsed[0] as Record<string, unknown> | null;
  const isSectionsShape = !!first && typeof first === "object" && "items" in first;

  if (isSectionsShape) {
    return { sections: parsed };
  }

  return {
    sections: [
      {
        id: "1",
        title: "Checklist",
        items: parsed,
      },
    ],
  };
}
