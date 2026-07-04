import { z } from "zod";

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
  title: boundedRequiredString(160).optional(),
  description: boundedOptionalString(5000),
  type: z.enum(["checklist", "recipe"]).optional(),
  seoTitle: boundedOptionalString(160),
  seoDescription: boundedOptionalString(320),
  rules: z.array(templateRuleSchema).optional(),
  is_public: z.boolean().optional(),
  categories: stringListField(20, 80),
  category: boundedOptionalString(80),
  tags: stringListField(20, 80),
  sections: z.unknown().optional(),
  items: z.unknown().optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase letters, numbers, and hyphens only")
    .optional(),
});

export const checklistPayloadSchema = z.object({
  teamId: z.string().trim().min(1).optional(),
  team_id: z.string().trim().min(1).optional(),
  template_id: z.string().trim().min(1).nullable().optional(),
  title: boundedRequiredString(160).optional(),
  sections: z.unknown().optional(),
  items: z.unknown().optional(),
  status: z.enum(["in_progress", "completed"]).optional(),
  progress: z.number().min(0).max(100).optional(),
  completed_at: z.string().datetime().nullable().optional(),
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
