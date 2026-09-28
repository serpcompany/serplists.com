import { describe, expect, it, vi } from "vitest";

import type { ChecklistTemplate } from "@/types/checklist";

import {
  buildTemplateEditorSavedState,
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

describe("stale editor protection", () => {
  const values = {
    title: "Existing Template",
    description: "",
    templateType: "checklist" as const,
    categories: [],
    tags: [],
    isPublic: false,
    seoTitle: "",
    seoDescription: "",
    seoUrl: "",
    sections: [],
  };

  it("keeps the version the template was loaded at", async () => {
    const cached = await loadTemplateEditorData({ id: "template-1", getCachedTemplate: () => buildTemplate({ version: 3 }) });
    const apiClient = { getTemplateById: vi.fn().mockResolvedValue({ id: "template-1", title: "API", version: 7, sections: [] }) };
    const fetched = await loadTemplateEditorData({ id: "template-1", getCachedTemplate: () => undefined }, { apiClient });

    expect(cached.version).toBe(3);
    expect(fetched.version).toBe(7);
  });

  it("sends the loaded version, and leaves visibility out unless the editor changed it", async () => {
    const saveTemplate = vi.fn().mockResolvedValue({ success: true, errors: [] });
    const baseline = { version: 3, isPublic: false };

    await saveTemplateEditorData({ id: "template-1", values, baseline }, { saveTemplate });
    await saveTemplateEditorData({ id: "template-1", values: { ...values, isPublic: true }, baseline }, { saveTemplate });

    expect(saveTemplate.mock.calls[0][0]).toEqual(expect.objectContaining({ version: 3, isPublic: undefined }));
    expect(saveTemplate.mock.calls[1][0]).toEqual(expect.objectContaining({ version: 3, isPublic: true }));
  });

  it("always sends visibility when creating a template", async () => {
    const saveTemplate = vi.fn().mockResolvedValue({ success: true, errors: [] });

    await saveTemplateEditorData({ values }, { saveTemplate });

    expect(saveTemplate.mock.calls[0][0]).toEqual(expect.objectContaining({ id: undefined, isPublic: false }));
  });

  it("moves the baseline to what was saved, at the version the save returned", () => {
    const saved = buildTemplateEditorSavedState({ ...values, isPublic: true }, 5);

    expect(saved.version).toBe(5);
    expect(saved.initialValues.isPublic).toBe(true);
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
