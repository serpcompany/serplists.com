import { z } from "zod";

export const templatePayloadSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(["checklist", "recipe"]).optional(),
  is_public: z.boolean().optional(),
  categories: z.union([z.array(z.string()), z.string()]).optional(),
  category: z.string().optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  sections: z.unknown().optional(),
  items: z.unknown().optional(),
  slug: z.string().optional(),
});

export const checklistPayloadSchema = z.object({
  template_id: z.string().nullable().optional(),
  title: z.string().optional(),
  sections: z.unknown().optional(),
  items: z.unknown().optional(),
  status: z.string().optional(),
  progress: z.number().optional(),
  completed_at: z.string().nullable().optional(),
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
