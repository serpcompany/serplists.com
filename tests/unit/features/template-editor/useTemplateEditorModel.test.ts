import { describe, expect, it, vi } from "vitest";

import type { ChecklistTemplate } from "@/types/checklist";

import {
  loadTemplateEditorData,
  saveTemplateEditorData,
  shouldLoadTemplateEditorRecord,
} from "@/features/template-editor/useTemplateEditorModel";
import { shouldNavigateToTemplatesAfterSave } from "@/pages/TemplateEditor";

const buildTemplate = (
  overrides: Partial<ChecklistTemplate> = {},
): ChecklistTemplate => ({
  id: "template-1",
  title: "Camping Checklist",
  description: "Pack the essentials.",
  type: "checklist",
  sections: [
    {
      id: "section-1",
      title: "Prep",
      items: [
        {
          id: "item-1",
          title: "Bring tent",
          description: "",
        },
      ],
    },
  ],
  userId: "user-1",
  createdAt: "2026-04-18T00:00:00.000Z",
  updatedAt: "2026-04-18T00:00:00.000Z",
  isPublic: true,
  slug: "camping-checklist",
  categories: ["Travel"],
  tags: ["camping"],
  seoTitle: "Camping Checklist",
  seoDescription: "Pack for your trip",
  seoUrl: "camping-checklist",
  ...overrides,
});

describe("loadTemplateEditorData", () => {
  it("loads an existing template from cached data first", async () => {
    const template = buildTemplate();
    const getCachedTemplate = vi.fn(() => template);
    const apiClient = {
      getTemplateById: vi.fn(),
    };

    const result = await loadTemplateEditorData(
      {
        id: "template-1",
        getCachedTemplate,
      },
      { apiClient },
    );

    expect(getCachedTemplate).toHaveBeenCalledWith("template-1");
    expect(apiClient.getTemplateById).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        loadError: null,
        templateSlug: "camping-checklist",
      }),
    );
    expect(result.initialValues).toEqual(
      expect.objectContaining({
        title: "Camping Checklist",
        description: "Pack the essentials.",
        categories: ["Travel"],
        tags: ["camping"],
        seoUrl: "camping-checklist",
      }),
    );
  });

  it("falls back to the API when the template is not cached", async () => {
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
        getCachedTemplate: vi.fn(() => undefined),
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

describe("loadTemplateEditorData versions", () => {
  it("keeps the version of the cached snapshot the form was built from", async () => {
    const result = await loadTemplateEditorData(
      {
        id: "template-1",
        getCachedTemplate: vi.fn(() => buildTemplate({ version: 5 })),
      },
      { apiClient: { getTemplateById: vi.fn() } },
    );

    expect(result.version).toBe(5);
  });

  it("keeps the version of the API record when the template is not cached", async () => {
    const result = await loadTemplateEditorData(
      {
        id: "template-2",
        getCachedTemplate: vi.fn(() => undefined),
      },
      {
        apiClient: {
          getTemplateById: vi.fn().mockResolvedValue({
            id: "template-2",
            title: "API Template",
            sections: [],
            version: 7,
          }),
        },
      },
    );

    expect(result.version).toBe(7);
  });

  it("has no version when the load fails", async () => {
    const result = await loadTemplateEditorData(
      {
        id: "template-3",
        getCachedTemplate: vi.fn(() => undefined),
      },
      {
        apiClient: {
          getTemplateById: vi.fn().mockRejectedValue(new Error("Not found")),
        },
      },
    );

    expect(result.version).toBeUndefined();
  });
});

describe("saveTemplateEditorData versions", () => {
  it("sends the version the editor loaded as the expected version", async () => {
    const saveTemplate = vi.fn().mockResolvedValue({ success: true, errors: [], version: 6 });

    await saveTemplateEditorData(
      {
        id: "template-1",
        expectedVersion: 5,
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

    expect(saveTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "template-1", expectedVersion: 5 }),
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

describe("saveTemplateEditorData validation", () => {
  const values = {
    title: "Existing Template",
    description: "",
    templateType: "checklist" as const,
    categories: [],
    tags: [],
    isPublic: true,
    seoTitle: "",
    seoDescription: "",
    seoUrl: "",
    sections: [],
  };

  it("names the field and skips the API when a value is over its limit", async () => {
    const saveTemplate = vi.fn();

    const result = await saveTemplateEditorData(
      {
        id: "template-1",
        expectedVersion: 2,
        values: { ...values, seoDescription: "x".repeat(400) },
      },
      { saveTemplate },
    );

    expect(saveTemplate).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.errors.map((error) => error.message).join(" ")).toContain(
      "Search description",
    );
  });

  it("sends a typed URL slug as a valid slug", async () => {
    const saveTemplate = vi.fn().mockResolvedValue({ success: true, errors: [] });

    await saveTemplateEditorData(
      {
        id: "template-1",
        expectedVersion: 2,
        values: { ...values, seoUrl: "My Launch Checklist" },
      },
      { saveTemplate },
    );

    expect(saveTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ seoUrl: "my-launch-checklist" }),
    );
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
