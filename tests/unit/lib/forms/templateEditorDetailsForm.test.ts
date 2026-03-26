import { describe, expect, it } from "vitest";

import type { ChecklistTemplate } from "@/types/checklist";
import {
  buildTemplateEditorDetailsFormValues,
  normalizeTemplateEditorDetailsForSave,
  templateEditorDetailsSchema,
} from "@/lib/forms/templateEditorDetailsForm";

describe("templateEditorDetailsForm", () => {
  it("provides stable defaults for a new template", () => {
    expect(buildTemplateEditorDetailsFormValues()).toEqual({
      title: "",
      description: "",
      templateType: "checklist",
      categories: [],
      tags: [],
      isPublic: true,
      seoTitle: "",
      seoDescription: "",
      seoUrl: "",
    });
  });

  it("maps an existing template into form values", () => {
    const template: ChecklistTemplate = {
      id: "template-1",
      title: "Technical SEO Audit",
      description: "Audit a site for crawl issues",
      type: "recipe",
      sections: [],
      userId: "user-1",
      createdAt: "2026-03-24T00:00:00.000Z",
      updatedAt: "2026-03-24T00:00:00.000Z",
      isPublic: false,
      slug: "technical-seo-audit",
      seoTitle: "Technical SEO Audit Template",
      seoDescription: "Run a repeatable audit",
      categories: ["SEO"],
      tags: ["audit", "seo"],
    };

    expect(buildTemplateEditorDetailsFormValues(template)).toEqual({
      title: "Technical SEO Audit",
      description: "Audit a site for crawl issues",
      templateType: "recipe",
      categories: ["SEO"],
      tags: ["audit", "seo"],
      isPublic: false,
      seoTitle: "Technical SEO Audit Template",
      seoDescription: "Run a repeatable audit",
      seoUrl: "technical-seo-audit",
    });
  });

  it("normalizes save values by trimming strings and deduping list fields", () => {
    expect(
      normalizeTemplateEditorDetailsForSave({
        title: "  Technical SEO Audit  ",
        description: "  Audit a site for crawl issues  ",
        templateType: "checklist",
        categories: ["SEO", "SEO", "  Technical SEO  ", ""],
        tags: ["audit", "audit", "  crawl  ", ""],
        isPublic: true,
        seoTitle: "  SEO Audit Template  ",
        seoDescription: "  Repeatable audit flow  ",
        seoUrl: "  technical-seo-audit  ",
      }),
    ).toEqual({
      title: "Technical SEO Audit",
      description: "Audit a site for crawl issues",
      templateType: "checklist",
      categories: ["SEO", "Technical SEO"],
      tags: ["audit", "crawl"],
      isPublic: true,
      seoTitle: "SEO Audit Template",
      seoDescription: "Repeatable audit flow",
      seoUrl: "technical-seo-audit",
    });
  });

  it("rejects unsupported template types", () => {
    const result = templateEditorDetailsSchema.safeParse({
      title: "Name",
      description: "",
      templateType: "playbook",
      categories: [],
      tags: [],
      isPublic: true,
      seoTitle: "",
      seoDescription: "",
      seoUrl: "",
    });

    expect(result.success).toBe(false);
  });
});
