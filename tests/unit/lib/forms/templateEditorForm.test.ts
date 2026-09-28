import { describe, expect, it } from "vitest";

import type { ChecklistTemplate } from "@/types/checklist";
import {
  buildTemplateEditorFormValues,
  createTemplateEditorContent,
  createTemplateEditorItem,
  createTemplateEditorSection,
  createTemplateEditorSubItem,
  findTemplateEditorContentPath,
  normalizeTemplateEditorFormForSave,
} from "@/lib/forms/templateEditorForm";

describe("templateEditorForm", () => {
  it("builds defaults for a new template editor session", () => {
    const result = buildTemplateEditorFormValues();

    expect(result.title).toBe("");
    expect(result.templateType).toBe("checklist");
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.title).toBe("");
    expect(result.sections[0]?.items).toEqual([]);
  });

  it("maps an existing template into form values", () => {
    const template: ChecklistTemplate = {
      id: "template-1",
      title: "Technical SEO Audit",
      description: "Audit a site",
      type: "recipe",
      sections: [
        {
          id: "section-1",
          title: "Discovery",
          items: [
            {
              id: "item-1",
              title: "Fetch crawl data",
              description: "Use crawler output",
              contents: [{ id: "content-1", type: "text", value: "Run crawl" }],
            },
          ],
        },
      ],
      userId: "user-1",
      createdAt: "2026-03-24T00:00:00.000Z",
      updatedAt: "2026-03-24T00:00:00.000Z",
      isPublic: true,
      slug: "technical-seo-audit",
      seoTitle: "Technical SEO Audit Template",
      seoDescription: "Repeatable audit",
      categories: ["SEO"],
      tags: ["audit"],
    };

    expect(buildTemplateEditorFormValues(template)).toMatchObject({
      title: "Technical SEO Audit",
      templateType: "recipe",
      seoUrl: "technical-seo-audit",
      sections: [
        {
          title: "Discovery",
          items: [{ title: "Fetch crawl data" }],
        },
      ],
    });
  });

  it("creates nested builder records with stable defaults", () => {
    const section = createTemplateEditorSection();
    const item = createTemplateEditorItem();
    const content = createTemplateEditorContent("subItems");
    const subItem = createTemplateEditorSubItem();

    expect(section.title).toBe("");
    expect(section.items).toEqual([]);
    expect(item.description).toBe("");
    expect(item.contents).toEqual([]);
    expect(content.type).toBe("subItems");
    expect(content.subItems).toHaveLength(1);
    expect(subItem.title).toBe("");
  });

  it("normalizes top-level fields and preserves nested sections for save", () => {
    const values = normalizeTemplateEditorFormForSave({
      title: "  Technical SEO Audit  ",
      description: "  Audit a site  ",
      templateType: "checklist",
      categories: ["SEO", "SEO", ""],
      tags: ["audit", "audit", ""],
      isPublic: true,
      seoTitle: "  SEO Audit Template ",
      seoDescription: "  Repeatable audit ",
      seoUrl: "  technical-seo-audit  ",
      sections: [
        {
          id: "section-1",
          title: "",
          items: [],
        },
      ],
    });

    expect(values).toMatchObject({
      title: "Technical SEO Audit",
      description: "Audit a site",
      categories: ["SEO"],
      tags: ["audit"],
      seoTitle: "SEO Audit Template",
      seoDescription: "Repeatable audit",
      seoUrl: "technical-seo-audit",
      sections: [{ id: "section-1", title: "", items: [] }],
    });
  });
});

describe("findTemplateEditorContentPath", () => {
  const sections = [
    { id: "s1", title: "One", items: [{ id: "i1", title: "A", contents: [] }] },
    {
      id: "s2",
      title: "Two",
      items: [
        { id: "i2", title: "B" },
        {
          id: "i3",
          title: "C",
          contents: [
            { id: "c1", type: "text" as const, value: "" },
            { id: "c2", type: "image" as const, value: "" },
          ],
        },
      ],
    },
  ];

  it("finds a content block by id wherever it now sits", () => {
    expect(findTemplateEditorContentPath(sections, "c2")).toBe(
      "sections.1.items.1.contents.1",
    );
  });

  it("returns null for a block that no longer exists", () => {
    expect(findTemplateEditorContentPath(sections, "missing")).toBeNull();
  });
});
