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
  it('blocks ambiguous cached content identities before editor load and before persistence', async () => {
    const sourceSections = [{ id: 's', title: 'Section', items: [{ id: 'i', title: 'Item', contents: [
      { id: 'duplicate', type: 'text' as const, value: 'A', extension: 'A' },
      { id: 'duplicate', type: 'text' as const, value: 'B', extension: 'B' },
    ] }] }];
    const loaded = await loadTemplateEditorData({ id: 'template-1', getCachedTemplate: () => buildTemplate({ sections: sourceSections }) });
    expect(loaded.loadError).toContain('invalid content');
    const saveTemplate = vi.fn();
    const result = await saveTemplateEditorData({ id: 'template-1', values: loaded.initialValues, sourceSections }, { saveTemplate });
    expect(result.success).toBe(false);
    expect(saveTemplate).not.toHaveBeenCalled();
  });
  it('allocates collision-free read identities for mixed legacy data without changing supplied IDs or values', async () => {
    const apiClient = { getTemplateById: vi.fn().mockResolvedValue({ id: 'legacy', items: [{ items: [
      { title: 'Missing item ID', completed: true, isCompleted: false, contents: [
        { type: 'text', value: 'A', extension: 'A' },
        { id: '1-1-content-1', type: 'text', value: 'B', extension: 'B' },
      ] },
      { id: '1-1', title: 'Supplied item ID' },
    ] }, { id: '1', items: [] }] }) };
    const loaded = await loadTemplateEditorData({ id: 'legacy', getCachedTemplate: () => undefined }, { apiClient });
    expect(loaded.loadError).toBeNull();
    const source = loaded.sourceSections!;
    expect(source[0].id).not.toBe('1');
    expect(source[1].id).toBe('1');
    expect(source[0].items[0].id).not.toBe('1-1');
    expect(source[0].items[1].id).toBe('1-1');
    expect(source[0].items[0].isCompleted).toBe(false);
    expect(source[0].items[0]).not.toHaveProperty('completed');
    expect(source[0].items[0].contents![0].id).not.toBe('1-1-content-1');
    const saveTemplate = vi.fn().mockResolvedValue({ success: true, errors: [] });
    await saveTemplateEditorData({ id: 'legacy', values: loaded.initialValues, sourceSections: source }, { saveTemplate });
    expect(saveTemplate.mock.calls[0][0].sections[0].items[0].contents.map((content: { extension: string }) => content.extension)).toEqual(['A', 'B']);
  });
  it('preserves extension fields by stable identity through editor save without resurrecting removed content', async () => {
    const sourceSections = [{ id: 'section', title: 'Section', extension: 'section data', items: [
      { id: 'kept', title: 'Old title', extension: { untouched: true }, description: 'Remove me', contents: [
        { id: 'keep-content', type: 'text' as const, value: 'Old text', extension: ['content data'] },
        { id: 'removed-content', type: 'text' as const, value: 'Remove', extension: 'do not revive' },
      ] },
      { id: 'removed', title: 'Remove', extension: 'do not revive' },
    ] }];
    const loaded = await loadTemplateEditorData({ id: 'template-1', getCachedTemplate: () => buildTemplate({ sections: sourceSections }) });
    loaded.initialValues.sections = [{ id: 'section', title: 'Edited section', items: [
      { id: 'kept', title: 'Edited title', contents: [{ id: 'keep-content', type: 'text', value: 'Edited text' }] },
      { id: 'new', title: 'New item' },
    ] }];
    const saveTemplate = vi.fn().mockResolvedValue({ success: true, errors: [] });
    await saveTemplateEditorData({ id: 'template-1', values: loaded.initialValues, sourceSections }, { saveTemplate });
    expect(saveTemplate.mock.calls[0][0].sections).toEqual([{ id: 'section', title: 'Edited section', extension: 'section data', items: [
      { id: 'kept', title: 'Edited title', extension: { untouched: true }, contents: [{ id: 'keep-content', type: 'text', value: 'Edited text', extension: ['content data'] }] },
      { id: 'new', title: 'New item' },
    ] }]);
  });
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
