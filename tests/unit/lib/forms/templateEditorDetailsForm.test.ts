import { describe, expect, it } from "vitest";

import { templatePayloadSchema } from "@functions/api/utils/payloads";
import type { ChecklistTemplate } from "@/types/checklist";
import {
  buildTemplateEditorDetailsFormValues,
  findTemplateEditorSlugIssue,
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

  const validDetails = {
    title: "Launch",
    description: "",
    templateType: "checklist" as const,
    categories: [],
    tags: [],
    isPublic: true,
    seoTitle: "",
    seoDescription: "",
    seoUrl: "",
  };

  it.each([
    ["My Launch Checklist", "my-launch-checklist"],
    ["launch_checklist", "launchchecklist"],
    ["launch-checklist-", "launch-checklist"],
    ["  --Café Opening!!  ", "cafe-opening"],
    ["Straße Checkliste", "strasse-checkliste"],
    ["   ", ""],
  ])("turns the typed URL slug %j into %j when saving", (typed, expected) => {
    expect(
      normalizeTemplateEditorDetailsForSave({ ...validDetails, seoUrl: typed }).seoUrl,
    ).toBe(expected);
  });

  it.each([
    ["!!!", "!!!"],
    [" Список ", "Список"],
  ])("keeps the typed URL slug %j, with nothing to keep, as %j for the save to refuse", (typed, expected) => {
    expect(
      normalizeTemplateEditorDetailsForSave({ ...validDetails, seoUrl: typed }).seoUrl,
    ).toBe(expected);
  });

  it("caps a long URL slug without leaving a trailing hyphen", () => {
    const { seoUrl } = normalizeTemplateEditorDetailsForSave({
      ...validDetails,
      seoUrl: "ab-".repeat(80),
    });

    expect(seoUrl.length).toBeLessThanOrEqual(160);
    expect(seoUrl).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(templatePayloadSchema.safeParse({ slug: seoUrl }).success).toBe(true);
  });

  it("refuses a typed URL slug with nothing to keep, naming the field, instead of keeping the old slug without saying why", () => {
    expect(findTemplateEditorSlugIssue("Список", "launch-checklist")).toBe(
      "URL Slug: use Latin letters or numbers.",
    );
    expect(findTemplateEditorSlugIssue("!!!")).toBe("URL Slug: use Latin letters or numbers.");
  });

  it.each([
    ["a blank field", "   ", undefined],
    ["a valid slug", "Launch Checklist", "launch-checklist"],
    ["an unedited stored slug today's rule would not produce", "список", "список"],
  ])("accepts %s", (_label, typed, storedSlug) => {
    expect(findTemplateEditorSlugIssue(typed, storedSlug)).toBeNull();
  });

  it("keeps the stored slug untouched when the field was not edited", () => {
    const storedSlug = `${"a".repeat(160)}-1a2b3c4d`;

    expect(
      normalizeTemplateEditorDetailsForSave({ ...validDetails, seoUrl: storedSlug }, { storedSlug })
        .seoUrl,
    ).toBe(storedSlug);
  });

  it.each([
    ["title", { title: "t".repeat(161) }, "Template name"],
    ["description", { description: "d".repeat(5001) }, "Goal / summary"],
    ["seoTitle", { seoTitle: "s".repeat(161) }, "Search title"],
    ["seoDescription", { seoDescription: "s".repeat(321) }, "Search description"],
    ["tags", { tags: Array.from({ length: 21 }, (_, index) => `tag-${index}`) }, "Tags"],
    ["tags", { tags: ["t".repeat(81)] }, "Tags"],
    ["categories", { categories: Array.from({ length: 21 }, (_, index) => `c-${index}`) }, "Categories"],
  ])("rejects an over-limit %s the API would reject, naming the field", (field, override, label) => {
    const editor = templateEditorDetailsSchema.safeParse({ ...validDetails, ...override });
    const api = templatePayloadSchema.safeParse(override);

    expect(api.success).toBe(false);
    expect(editor.success).toBe(false);
    if (!editor.success) {
      expect(editor.error.issues[0]?.path[0]).toBe(field);
      expect(editor.error.issues[0]?.message).toContain(label);
    }
  });

  it("accepts values at the API limits", () => {
    const atLimits = {
      title: "t".repeat(160),
      description: "d".repeat(5000),
      seoTitle: "s".repeat(160),
      seoDescription: "s".repeat(320),
      tags: Array.from({ length: 20 }, (_, index) => `${index}`.padEnd(80, "t")),
      categories: Array.from({ length: 20 }, (_, index) => `c-${index}`),
    };

    expect(templateEditorDetailsSchema.safeParse({ ...validDetails, ...atLimits }).success).toBe(true);
    expect(templatePayloadSchema.safeParse(atLimits).success).toBe(true);
  });
});
