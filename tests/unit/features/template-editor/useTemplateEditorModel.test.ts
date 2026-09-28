import { describe, expect, it, vi } from "vitest";

import {
  loadTemplateEditorData,
  saveTemplateEditorData,
  shouldLoadTemplateEditorRecord,
} from "@/features/template-editor/useTemplateEditorModel";
import { shouldNavigateToTemplatesAfterSave } from "@/pages/TemplateEditor";

describe("loadTemplateEditorData", () => {
  it("loads an existing template by id", async () => {
    const apiClient = {
      getTemplateById: vi.fn().mockResolvedValue({
        id: "template-2",
        title: "API Template",
        description: "Loaded from API",
        type: "recipe",
        sections: [
          {
            id: "section-9",
            title: "Cook",
            items: [],
          },
        ],
        categories: ["Food"],
        tags: ["recipe"],
        user_id: "user-9",
        created_at: "2026-04-18T00:00:00.000Z",
        updated_at: "2026-04-18T00:00:00.000Z",
        is_public: false,
        slug: "api-template",
        seoTitle: "API SEO",
        seoDescription: "API description",
      }),
    };

    const result = await loadTemplateEditorData(
      {
        id: "template-2",
      },
      { apiClient },
    );

    expect(apiClient.getTemplateById).toHaveBeenCalledWith("template-2");
    expect(result).toEqual(
      expect.objectContaining({
        loadError: null,
        templateSlug: "api-template",
      }),
    );
    expect(result.initialValues).toEqual(
      expect.objectContaining({
        title: "API Template",
        description: "Loaded from API",
        templateType: "recipe",
        categories: ["Food"],
        tags: ["recipe"],
        isPublic: false,
        seoTitle: "API SEO",
        seoDescription: "API description",
        seoUrl: "api-template",
      }),
    );
  });
});

describe("saveTemplateEditorData", () => {
  it("returns a pure create outcome after normalizing the payload", async () => {
    const saveTemplate = vi.fn().mockResolvedValue({
      success: true,
      errors: [],
    });

    const result = await saveTemplateEditorData(
      {
        values: {
          title: "  New Template  ",
          description: "  A description  ",
          templateType: "checklist",
          categories: ["SEO", "SEO", "  "],
          tags: ["audit", "audit"],
          isPublic: true,
          seoTitle: "  Search title  ",
          seoDescription: "  Search description  ",
          seoUrl: "  new-template  ",
          sections: [
            {
              id: "section-1",
              title: "Section",
              items: [],
            },
          ],
        },
      },
      { saveTemplate },
    );

    expect(saveTemplate).toHaveBeenCalledWith({
      id: undefined,
      title: "New Template",
      description: "A description",
      templateType: "checklist",
      categories: ["SEO"],
      tags: ["audit"],
      isPublic: true,
      seoTitle: "Search title",
      seoDescription: "Search description",
      seoUrl: "new-template",
      sections: [
        {
          id: "section-1",
          title: "Section",
          items: [],
        },
      ],
    });
    expect(result).toEqual({
      success: true,
      errors: [],
    });
  });

  it("returns a pure update outcome", async () => {
    const saveTemplate = vi.fn().mockResolvedValue({
      success: true,
      errors: [],
    });

    const result = await saveTemplateEditorData(
      {
        id: "template-1",
        values: {
          title: "Existing Template",
          description: "",
          templateType: "checklist",
          categories: [],
          tags: [],
          isPublic: true,
          seoTitle: "",
          seoDescription: "",
          seoUrl: "",
          sections: [],
        },
      },
      { saveTemplate },
    );

    expect(result).toEqual({
      success: true,
      errors: [],
    });
  });

  it("returns typed save errors without redirect decisions", async () => {
    const saveTemplate = vi.fn().mockResolvedValue({
      success: false,
      errors: [{ type: "save", message: "Save failed" }],
    });

    const result = await saveTemplateEditorData(
      {
        id: "template-1",
        values: {
          title: "Existing Template",
          description: "",
          templateType: "checklist",
          categories: [],
          tags: [],
          isPublic: true,
          seoTitle: "",
          seoDescription: "",
          seoUrl: "changed-slug",
          sections: [],
        },
      },
      { saveTemplate },
    );

    expect(result).toEqual({
      success: false,
      errors: [{ type: "save", message: "Save failed" }],
    });
  });
});

describe("editor lane decisions", () => {
  it("does not request a reload for the same editor record", () => {
    expect(shouldLoadTemplateEditorRecord("template-1", null)).toBe(true);
    expect(shouldLoadTemplateEditorRecord("template-1", "template-1")).toBe(
      false,
    );
    expect(shouldLoadTemplateEditorRecord("template-2", "template-1")).toBe(
      true,
    );
    expect(shouldLoadTemplateEditorRecord(undefined, "template-1")).toBe(
      false,
    );
  });

  it("navigates to templates only after a successful create save", () => {
    expect(
      shouldNavigateToTemplatesAfterSave({
        id: undefined,
        result: { success: true, errors: [] },
      }),
    ).toBe(true);

    expect(
      shouldNavigateToTemplatesAfterSave({
        id: "template-1",
        result: { success: true, errors: [] },
      }),
    ).toBe(false);

    expect(
      shouldNavigateToTemplatesAfterSave({
        id: undefined,
        result: {
          success: false,
          errors: [{ type: "save", message: "failed" }],
        },
      }),
    ).toBe(false);
  });
});
