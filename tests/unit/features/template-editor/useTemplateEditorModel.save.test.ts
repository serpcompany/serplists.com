import { describe, expect, it, vi } from "vitest";

import {
  buildTemplateEditorSavedState,
  loadTemplateEditorData,
  saveTemplateEditorData,
  shouldLoadTemplateEditorRecord,
  shouldNavigateToTemplatesAfterSave,
} from "@/features/template-editor/useTemplateEditorModel";

type EditorValues = Parameters<typeof saveTemplateEditorData>[0]["values"];

const existingTemplateValues = (overrides: Partial<EditorValues> = {}): EditorValues => ({
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
  ...overrides,
});

describe("saveTemplateEditorData versions", () => {
  it("sends the version the editor loaded as the expected version", async () => {
    const saveTemplate = vi.fn().mockResolvedValue({ success: true, errors: [], version: 6 });

    await saveTemplateEditorData(
      {
        id: "template-1",
        expectedVersion: 5,
        values: existingTemplateValues(),
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
        values: existingTemplateValues(),
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
        values: existingTemplateValues({ seoUrl: "changed-slug" }),
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
  const values = existingTemplateValues();

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

  it.each([undefined, "launch-checklist"])(
    "refuses a typed URL slug with no Latin letters or digits instead of dropping it (stored %j)",
    async (storedSlug) => {
      const saveTemplate = vi.fn();

      const result = await saveTemplateEditorData(
        { id: storedSlug && "template-1", expectedVersion: 2, storedSlug, values: { ...values, seoUrl: "Список" } },
        { saveTemplate },
      );

      expect(saveTemplate).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        errors: [{ type: "validation", message: "URL Slug: use Latin letters or numbers." }],
      });
    },
  );

  it("keeps saving a template whose unedited stored slug today's rule would not produce", async () => {
    const saveTemplate = vi.fn().mockResolvedValue({ success: true, errors: [] });

    const result = await saveTemplateEditorData(
      { id: "template-1", expectedVersion: 2, storedSlug: "список", values: { ...values, seoUrl: "список" } },
      { saveTemplate },
    );

    expect(result.success).toBe(true);
    expect(saveTemplate).toHaveBeenCalledWith(expect.objectContaining({ seoUrl: "список" }));
  });
});

describe("stale editor protection", () => {
  const values = existingTemplateValues({ isPublic: false });

  it("keeps the version the template was loaded at", async () => {
    const apiClient = { getTemplateById: vi.fn().mockResolvedValue({ id: "template-1", title: "API", version: 7, sections: [] }) };
    const fetched = await loadTemplateEditorData({ id: "template-1" }, { apiClient });

    expect(fetched.version).toBe(7);
  });

  it("sends the loaded version, and leaves visibility out unless the editor changed it", async () => {
    const saveTemplate = vi.fn().mockResolvedValue({ success: true, errors: [] });
    const loaded = { expectedVersion: 3, loadedIsPublic: false };

    await saveTemplateEditorData({ id: "template-1", values, ...loaded }, { saveTemplate });
    await saveTemplateEditorData({ id: "template-1", values: { ...values, isPublic: true }, ...loaded }, { saveTemplate });

    expect(saveTemplate.mock.calls[0][0]).toEqual(expect.objectContaining({ expectedVersion: 3, isPublic: undefined }));
    expect(saveTemplate.mock.calls[1][0]).toEqual(expect.objectContaining({ expectedVersion: 3, isPublic: true }));
  });

  it("always sends visibility when creating a template", async () => {
    const saveTemplate = vi.fn().mockResolvedValue({ success: true, errors: [] });

    await saveTemplateEditorData({ values }, { saveTemplate });

    expect(saveTemplate.mock.calls[0][0]).toEqual(expect.objectContaining({ id: undefined, isPublic: false }));
  });

  it("moves the baseline to what was saved", () => {
    const saved = buildTemplateEditorSavedState({ ...values, isPublic: true });

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
