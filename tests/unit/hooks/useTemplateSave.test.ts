import { describe, expect, it, vi } from "vitest";

import { persistTemplateSave } from "@/hooks/useTemplateSave";
import type { ChecklistSection, TemplateSavePayload } from "@/types/checklist";

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
  getTemplate: vi.fn(() => undefined as TemplateSavePayload | undefined),
  createTemplate: vi.fn().mockResolvedValue({ id: "template-1" }),
  updateTemplate: vi.fn().mockResolvedValue(undefined),
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

  it("waits for update success and preserves rules from the cached template", async () => {
    const dependencies = buildDependencies({
      getTemplate: vi.fn(() => ({
        id: "template-1",
        title: "Old title",
        description: "Old description",
        type: "checklist",
        sections: baseSections,
        isPublic: true,
        rules: [{ id: "rule-1", type: "required", path: "sections.0" }],
      })),
    });

    const result = await persistTemplateSave(
      dependencies,
      buildInput({ id: "template-1", title: "Updated title" }),
    );

    expect(result).toEqual({ success: true, errors: [] });
    expect(dependencies.updateTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "template-1",
        title: "Updated title",
        slug: "template-title",
        rules: [{ id: "rule-1", type: "required", path: "sections.0" }],
      }),
    );
  });

  it("guards the save with the version the editor loaded, not a newer cached one, and returns the saved version", async () => {
    const dependencies = buildDependencies({
      // The list refetched after another tab shared the template.
      getTemplate: vi.fn(() => ({ id: "template-1", title: "T", sections: baseSections, isPublic: true, version: 4 })),
      updateTemplate: vi.fn().mockResolvedValue({ version: 6 }),
    });

    const result = await persistTemplateSave(
      dependencies,
      buildInput({ id: "template-1", isPublic: undefined, version: 3 }),
    );

    expect(result).toEqual({ success: true, errors: [], version: 6 });
    const payload = dependencies.updateTemplate.mock.calls[0][0];
    expect(payload.version).toBe(3);
    expect(payload.isPublic).toBeUndefined();
  });

  it("falls back to the cached version when the editor has none", async () => {
    const dependencies = buildDependencies({
      getTemplate: vi.fn(() => ({ id: "template-1", title: "T", sections: baseSections, isPublic: true, version: 4 })),
    });

    await persistTemplateSave(dependencies, buildInput({ id: "template-1" }));

    expect(dependencies.updateTemplate.mock.calls[0][0].version).toBe(4);
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
