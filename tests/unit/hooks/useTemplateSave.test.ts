import { describe, expect, it, vi } from "vitest";

import { persistTemplateSave } from "@/hooks/useTemplateSave";
import type { ChecklistSection } from "@/types/checklist";

const baseSections: ChecklistSection[] = [
  {
    id: "section-1",
    title: "Section",
    items: [
      {
        id: "item-1",
        title: "Task",
        description: "",
      },
    ],
  },
];

const buildInput = (overrides: Partial<Parameters<typeof persistTemplateSave>[1]> = {}) => ({
  title: "Template title",
  description: "Template description",
  sections: baseSections,
  seoTitle: "SEO title",
  seoDescription: "SEO description",
  seoUrl: "template-title",
  templateType: "checklist" as const,
  categories: ["SEO"],
  tags: ["audit"],
  isPublic: true,
  ...overrides,
});

const buildDependencies = (
  overrides: Partial<Parameters<typeof persistTemplateSave>[0]> = {},
) => ({
  createTemplate: vi.fn().mockResolvedValue({ id: "template-1" }),
  updateTemplate: vi.fn().mockResolvedValue({ version: 2, slug: "template-title" }),
  applyDefaults: vi.fn((title: string, sections: ChecklistSection[]) => ({
    title: title.trim(),
    sections,
  })),
  ...overrides,
});

describe("persistTemplateSave", () => {
  it("returns success after create without owning navigation", async () => {
    let createResolved = false;
    const dependencies = buildDependencies({
      createTemplate: vi.fn().mockImplementation(async () => {
        await Promise.resolve();
        createResolved = true;
        return { id: "template-1" };
      }),
    });

    const result = await persistTemplateSave(dependencies, buildInput());

    expect(result).toEqual({ success: true, errors: [] });
    expect(dependencies.createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Template title",
        seoUrl: "template-title",
      }),
    );
    expect(createResolved).toBe(true);
  });

  it("waits for update success and sends the loaded rules and version", async () => {
    const rules = [{ id: "rule-1", type: "required-field" as const, path: "sections.0", severity: "warning" as const }];
    const dependencies = buildDependencies();

    const result = await persistTemplateSave(
      dependencies,
      buildInput({ id: "template-1", title: "Updated title", version: 1, rules }),
    );

    expect(result).toEqual({ success: true, errors: [], saved: { version: 2, slug: "template-title" } });
    expect(dependencies.updateTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "template-1",
        title: "Updated title",
        slug: "template-title",
        rules,
        version: 1,
      }),
    );
  });

  it("returns failure when create rejects", async () => {
    const dependencies = buildDependencies({
      createTemplate: vi.fn().mockRejectedValue(new Error("create failed")),
    });

    const result = await persistTemplateSave(dependencies, buildInput());

    expect(result).toEqual({
      success: false,
      errors: [{ type: "save", message: "create failed" }],
    });
  });

  it("returns failure when update rejects", async () => {
    const dependencies = buildDependencies({
      updateTemplate: vi.fn().mockRejectedValue(new Error("update failed")),
    });

    const result = await persistTemplateSave(
      dependencies,
      buildInput({ id: "template-1" }),
    );

    expect(result).toEqual({
      success: false,
      errors: [{ type: "save", message: "update failed" }],
    });
  });
});
