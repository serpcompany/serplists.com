import { describe, expect, it, vi } from "vitest";

import { persistTemplateSave } from "@/hooks/useTemplateSave";
import { applyTemplateSaveDefaults } from "@/hooks/useTemplateValidation";
import { createApiError } from "@/lib/api-errors";
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

    expect(result).toEqual({
      success: true,
      errors: [],
      saved: { title: "Template title", sections: baseSections },
    });
    expect(dependencies.createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Template title",
        seoUrl: "template-title",
      }),
    );
    expect(createResolved).toBe(true);
  });

  it("sends the version the editor loaded, never the list cache's", async () => {
    const dependencies = buildDependencies({
      // A background list refetch has already picked up another editor's save.
      getTemplate: vi.fn(() => ({
        id: "template-1",
        title: "Newer title",
        description: "",
        type: "checklist",
        sections: baseSections,
        isPublic: true,
        version: 6,
        rules: [{ id: "rule-1", type: "required", path: "sections.0" }],
      })),
    } as Partial<Parameters<typeof persistTemplateSave>[0]>);

    const result = await persistTemplateSave(
      dependencies,
      buildInput({ id: "template-1", title: "Updated title", expectedVersion: 5 }),
    );

    expect(result.success).toBe(true);
    expect(dependencies.updateTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "template-1",
        title: "Updated title",
        slug: "template-title",
        version: 5,
      }),
    );
    // The editor does not edit rules, so the stored rules are left untouched.
    expect(dependencies.updateTemplate.mock.calls[0][0]).not.toHaveProperty("rules");
  });

  it("returns the version the server saved so the next save can send it", async () => {
    const dependencies = buildDependencies({
      updateTemplate: vi.fn().mockResolvedValue({ success: true, version: 6 }),
    });

    const result = await persistTemplateSave(
      dependencies,
      buildInput({ id: "template-1", expectedVersion: 5 }),
    );

    expect(result).toEqual({
      success: true,
      errors: [],
      version: 6,
      saved: { title: "Template title", sections: baseSections },
    });
  });

  // The editor rebuilds its form from this, so it must match what was stored: an empty
  // section's placeholder task, "Task N" titles, and "Untitled Template".
  it("returns the title and sections it sent, after defaults", async () => {
    const dependencies = buildDependencies({
      applyDefaults: applyTemplateSaveDefaults,
      updateTemplate: vi.fn().mockResolvedValue({ version: 4 }),
    });

    const result = await persistTemplateSave(
      dependencies,
      buildInput({
        id: "template-1",
        expectedVersion: 3,
        title: "  ",
        sections: [
          ...baseSections,
          { id: "section-2", title: "Phase 2", items: [] },
          { id: "section-3", title: "Phase 3", items: [{ id: "item-9", title: "" }] },
        ],
      }),
    );

    const sent = dependencies.updateTemplate.mock.calls[0][0];
    expect(result.saved).toEqual({ title: sent.title, sections: sent.sections });
    expect(result.saved?.title).toBe("Untitled Template");
    expect(result.saved?.sections[1].items.map((item) => item.title)).toEqual(["New task"]);
    expect(result.saved?.sections[2].items.map((item) => item.title)).toEqual(["Task 1"]);
  });

  it("sends no blank section title or blank sub-task", async () => {
    const dependencies = buildDependencies({ applyDefaults: applyTemplateSaveDefaults });

    const result = await persistTemplateSave(
      dependencies,
      buildInput({
        sections: [{
          id: "section-1",
          title: "",
          items: [{
            id: "item-1",
            title: "Audit",
            contents: [{
              id: "content-1",
              type: "subItems",
              value: "",
              subItems: [{ id: "sub-a", title: "A" }, { id: "sub-b", title: "" }],
            }],
          }],
        }],
      }),
    );

    const sent = dependencies.createTemplate.mock.calls[0][0];
    expect(sent.sections[0].title).toBe("Section 1");
    expect(sent.sections[0].items[0].contents?.[0].subItems).toEqual([{ id: "sub-a", title: "A" }]);
    // The editor rebuilds its form from what was sent.
    expect(result.saved?.sections).toEqual(sent.sections);
  });

  it("returns the created title and sections, after defaults", async () => {
    const dependencies = buildDependencies({ applyDefaults: applyTemplateSaveDefaults });

    const result = await persistTemplateSave(
      dependencies,
      buildInput({ title: "", sections: [{ id: "section-1", title: "Prep", items: [] }] }),
    );

    const sent = dependencies.createTemplate.mock.calls[0][0];
    expect(result.saved).toEqual({ title: sent.title, sections: sent.sections });
  });

  it("returns the slug the server stored, which may carry a suffix", async () => {
    const dependencies = buildDependencies({
      updateTemplate: vi.fn().mockResolvedValue({ slug: "moving-checklist-1a2b3c4d", version: 6 }),
    });

    const result = await persistTemplateSave(
      dependencies,
      buildInput({ id: "template-1", expectedVersion: 5, seoUrl: "moving-checklist" }),
    );

    expect(result.slug).toBe("moving-checklist-1a2b3c4d");
  });

  it("refuses to update without a loaded version instead of skipping the conflict check", async () => {
    const dependencies = buildDependencies();

    const result = await persistTemplateSave(
      dependencies,
      buildInput({ id: "template-1" }),
    );

    expect(result.success).toBe(false);
    expect(result.errors[0]?.message).toMatch(/reload/i);
    expect(dependencies.updateTemplate).not.toHaveBeenCalled();
  });

  it("does not resend a stored slug the user did not change", async () => {
    // Stored slugs can predate today's limits; resending one would fail validation or move the URL.
    const storedSlug = `${"a".repeat(160)}-1a2b3c4d`;
    const dependencies = buildDependencies();

    await persistTemplateSave(
      dependencies,
      buildInput({ id: "template-1", expectedVersion: 3, seoUrl: storedSlug, storedSlug }),
    );

    const payload = dependencies.updateTemplate.mock.calls[0][0];
    expect(payload.slug).toBeUndefined();
    expect(payload.seoUrl).toBeUndefined();
  });

  it("sends a slug the user changed", async () => {
    const dependencies = buildDependencies();

    await persistTemplateSave(
      dependencies,
      buildInput({ id: "template-1", expectedVersion: 3, seoUrl: "new-slug", storedSlug: "old-slug" }),
    );

    expect(dependencies.updateTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "new-slug", seoUrl: "new-slug" }),
    );
  });

  it("leaves visibility out of an update the editor's switch did not change, and returns the saved version", async () => {
    const dependencies = buildDependencies({
      updateTemplate: vi.fn().mockResolvedValue({ version: 6 }),
    });

    const result = await persistTemplateSave(
      dependencies,
      buildInput({ id: "template-1", isPublic: undefined, expectedVersion: 3 }),
    );

    expect(result).toMatchObject({ success: true, errors: [], version: 6 });
    const payload = dependencies.updateTemplate.mock.calls[0][0];
    expect(payload.version).toBe(3);
    expect(payload.isPublic).toBeUndefined();
  });

  it("returns failure when create rejects", async () => {
    const dependencies = buildDependencies({
      createTemplate: vi.fn().mockRejectedValue(new Error("create failed")),
    });

    const result = await persistTemplateSave(dependencies, buildInput());

    expect(result).toEqual({
      success: false,
      errors: [{ type: "save", message: "create failed" }],
      failure: { kind: "error", message: "create failed" },
    });
  });

  it("returns failure when update rejects", async () => {
    const dependencies = buildDependencies({
      updateTemplate: vi.fn().mockRejectedValue(new Error("update failed")),
    });

    const result = await persistTemplateSave(
      dependencies,
      buildInput({ id: "template-1", expectedVersion: 2 }),
    );

    expect(result).toEqual({
      success: false,
      errors: [{ type: "save", message: "update failed" }],
      failure: { kind: "error", message: "update failed" },
    });
  });

  // The editor offers an upgrade only if it can tell a plan gate from any other error.
  it("keeps a plan-limit failure as upgrade_required", async () => {
    const message = "Template limit reached. Upgrade to create more templates.";
    const dependencies = buildDependencies({
      createTemplate: vi
        .fn()
        .mockRejectedValue(createApiError(403, { error: message, code: "limit_reached" })),
    });

    const result = await persistTemplateSave(dependencies, buildInput());

    expect(result.success).toBe(false);
    expect(result.failure).toEqual({ kind: "upgrade_required", message });
    expect(result.errors).toEqual([{ type: "save", message }]);
  });

  it("keeps an expired session as auth_required", async () => {
    const dependencies = buildDependencies({
      updateTemplate: vi.fn().mockRejectedValue(createApiError(401, { error: "Unauthorized" })),
    });

    const result = await persistTemplateSave(
      dependencies,
      buildInput({ id: "template-1", expectedVersion: 2 }),
    );

    expect(result.failure?.kind).toBe("auth_required");
  });

  it("marks a save refused because the template changed since it was loaded", async () => {
    const dependencies = buildDependencies({
      updateTemplate: vi.fn().mockRejectedValue(
        createApiError(409, {
          error: "Template changed since it was loaded. Refresh before saving again.",
          code: "edit_conflict",
        }),
      ),
    });

    const result = await persistTemplateSave(
      dependencies,
      buildInput({ id: "template-1", expectedVersion: 5 }),
    );

    expect(result.success).toBe(false);
    expect(result.editConflict).toBe(true);
  });
});
