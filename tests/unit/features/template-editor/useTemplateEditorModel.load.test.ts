import { describe, expect, it, vi } from "vitest";
import { firstOf, sectionAt } from "../../../support/elements";

import type { ChecklistTemplate } from "@/types/checklist";

import { loadTemplateEditorData } from "@/features/template-editor/useTemplateEditorModel";
import { templateEditorFormSchema } from "@/lib/forms/templateEditorForm";

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
  it("always loads the template by id, even when the lists hold an older copy, so a teammate's newer save is never missing", async () => {
    const getCachedTemplate = vi.fn(() => buildTemplate({ title: "Old title", version: 5 }));
    const apiClient = {
      getTemplateById: vi.fn().mockResolvedValue({
        id: "template-1",
        title: "New title",
        sections: [
          {
            id: "section-1",
            title: "Prep",
            items: [
              { id: "item-1", title: "Bring tent" },
              { id: "item-2", title: "Added by a teammate" },
            ],
          },
        ],
        slug: "camping-checklist",
        version: 6,
      }),
    };

    const result = await loadTemplateEditorData(
      { id: "template-1", getCachedTemplate } as Parameters<typeof loadTemplateEditorData>[0],
      { apiClient },
    );

    expect(apiClient.getTemplateById).toHaveBeenCalledWith("template-1");
    expect(getCachedTemplate).not.toHaveBeenCalled();
    expect(result.version).toBe(6);
    expect(result.initialValues.title).toBe("New title");
    expect(sectionAt(result.initialValues, 0).items.map((item) => item.title)).toEqual([
      "Bring tent",
      "Added by a teammate",
    ]);
  });

  it("reports a failed load instead of editing a cached copy", async () => {
    const result = await loadTemplateEditorData(
      {
        id: "template-1",
        getCachedTemplate: vi.fn(() => buildTemplate({ version: 5 })),
      } as Parameters<typeof loadTemplateEditorData>[0],
      { apiClient: { getTemplateById: vi.fn().mockRejectedValue(new Error("Template not found")) } },
    );

    expect(result.loadError).toBe("Template not found");
    expect(result.version).toBeUndefined();
  });

  it("keeps who owns the loaded template, which decides whether the viewer may edit, and nothing for a new one or a failed load", async () => {
    const organizationTemplate = await loadTemplateEditorData(
      { id: "template-3" },
      {
        apiClient: {
          getTemplateById: vi.fn().mockResolvedValue({
            id: "template-3",
            title: "Organization Template",
            user_id: "creator-1",
            team_id: "team-1",
            owner_type: "team",
          }),
        },
      },
    );
    const failed = await loadTemplateEditorData(
      { id: "template-3" },
      { apiClient: { getTemplateById: vi.fn().mockRejectedValue(new Error("Template not found")) } },
    );

    expect(organizationTemplate.ownership).toEqual({
      userId: "creator-1",
      teamId: "team-1",
      ownerType: "team",
    });
    expect((await loadTemplateEditorData({})).ownership).toBeUndefined();
    expect(failed.ownership).toBeUndefined();
  });

  it("maps the API record into the editor form", async () => {
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
      { id: "template-2" },
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

  it("keeps stored content the display mapper drops, which older rows can hold, so the next save does not delete it", async () => {
    const apiClient = {
      getTemplateById: vi.fn().mockResolvedValue({
        id: "template-3",
        title: "Legacy",
        version: 4,
        sections: [
          {
            id: "section-1",
            title: "Prep",
            items: [
              {
                id: "item-1",
                title: "Task",
                description: 12,
                contents: [
                  { id: "c1", type: "link", value: "https://example.com" },
                  { id: 1, type: "text", value: 5 },
                  "Just some text",
                  { id: "c2", type: "file", value: "https://example.com/doc.pdf", fileName: null, fileSize: null },
                ],
              },
            ],
          },
        ],
      }),
    };

    const result = await loadTemplateEditorData({ id: "template-3" }, { apiClient });
    const item = firstOf(sectionAt(result.initialValues, 0).items);

    expect(result.version).toBe(4);
    expect(item.description).toBe("12");
    expect(item.contents).toEqual([
      expect.objectContaining({ id: "c1", type: "text", value: "https://example.com" }),
      expect.objectContaining({ id: "1", type: "text", value: "5" }),
      expect.objectContaining({ type: "text", value: "Just some text" }),
      expect.objectContaining({ id: "c2", type: "file", value: "https://example.com/doc.pdf" }),
    ]);
    expect(templateEditorFormSchema.safeParse(result.initialValues).success).toBe(true);
  });
});

describe("loadTemplateEditorData versions", () => {
  it("keeps the version of the API record the form was built from", async () => {
    const result = await loadTemplateEditorData(
      { id: "template-2" },
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
      { id: "template-3" },
      {
        apiClient: {
          getTemplateById: vi.fn().mockRejectedValue(new Error("Not found")),
        },
      },
    );

    expect(result.version).toBeUndefined();
  });
});

describe("loadTemplateEditorData owner, under whom the Search & SEO preview puts the public URL", () => {
  it("keeps the creator's username from the loaded record", async () => {
    const result = await loadTemplateEditorData(
      { id: "template-2" },
      {
        apiClient: {
          getTemplateById: vi.fn().mockResolvedValue({
            id: "template-2",
            user_id: "user-2",
            title: "API Template",
            slug: "api-template",
            sections: [],
            owner_username: "teammate",
          }),
        },
      },
    );

    expect(result.ownerSlug).toBe("teammate");
  });

  it("has no owner slug when the creator has no username", async () => {
    const result = await loadTemplateEditorData(
      { id: "template-2" },
      {
        apiClient: {
          getTemplateById: vi.fn().mockResolvedValue({
            id: "template-2",
            user_id: "user-2",
            title: "API Template",
            sections: [],
            owner_username: null,
          }),
        },
      },
    );

    expect(result.ownerSlug).toBeNull();
  });

  it("has no owner for a new template", async () => {
    expect((await loadTemplateEditorData({})).ownerSlug).toBeUndefined();
  });
});
