import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { templateEditorRouteKey } from "@/features/template-editor/navigationGuards";
import {
  resolveTemplateSaveFeedback,
  shouldApplyTemplateEditorSaveResult,
} from "@/features/template-editor/useTemplateEditorModel";

// /dashboard/templates/:id/edit and /dashboard/templates/new rendered the same unkeyed
// <TemplateEditor />, so React kept one instance across them (the legacy
// /console/templates/:id/edit now redirects to the first, in next.config.ts). A failed save's error and the
// selection carried over to the blank form, and a save of A that finished after the user
// clicked "New Template" filled the new form with A (Save then created a copy of A).

describe("template editor route identity", () => {
  it("gives every template, and the new-template form, its own key", () => {
    expect(templateEditorRouteKey("template-a")).not.toBe(templateEditorRouteKey(undefined));
    expect(templateEditorRouteKey("template-a")).not.toBe(templateEditorRouteKey("template-b"));
    expect(templateEditorRouteKey("template-a")).toBe(templateEditorRouteKey("template-a"));
    expect(templateEditorRouteKey(undefined)).toBe(templateEditorRouteKey(undefined));
  });

  it("renders every editor route through the keyed route wrapper", () => {
    const editorPages = [
      "src/app/(app)/dashboard/templates/new/page.tsx",
      "src/app/(app)/dashboard/templates/[id]/edit/page.tsx",
    ];

    for (const page of editorPages) {
      const source = readFileSync(path.resolve(__dirname, "../../../..", page), "utf8");
      expect(source, page).toContain("<TemplateEditorRoute />");
      expect(source, page).not.toMatch(/<TemplateEditor\s*\/>/);
    }
  });
});

describe("save results after the editor moved on", () => {
  it("applies a save result only to the same, still mounted, editor", () => {
    expect(shouldApplyTemplateEditorSaveResult({ requestedId: "template-a", currentId: "template-a", mounted: true })).toBe(true);
    expect(shouldApplyTemplateEditorSaveResult({ requestedId: undefined, currentId: undefined, mounted: true })).toBe(true);
    expect(shouldApplyTemplateEditorSaveResult({ requestedId: "template-a", currentId: undefined, mounted: true })).toBe(false);
    expect(shouldApplyTemplateEditorSaveResult({ requestedId: "template-a", currentId: "template-b", mounted: true })).toBe(false);
    expect(shouldApplyTemplateEditorSaveResult({ requestedId: "template-a", currentId: "template-a", mounted: false })).toBe(false);
  });

  it("does not show a finished save of the previous template on the page the user moved to", () => {
    const saved = { success: true, errors: [], stale: true };

    expect(resolveTemplateSaveFeedback({ id: "template-a", result: saved })).toEqual({
      successMessage: "Template saved",
      errorMessage: null,
      navigateToTemplates: false,
      inlineErrors: null,
    });
  });

  it("does not pull the user back to the Templates list for a create that finished after they left", () => {
    const created = { success: true, errors: [], stale: true };

    expect(resolveTemplateSaveFeedback({ id: undefined, result: created })).toMatchObject({
      successMessage: "Template created",
      navigateToTemplates: false,
      inlineErrors: null,
    });
  });

  it("reports a failed save of the previous template as a toast, not as an error on the new form", () => {
    const failed = {
      success: false,
      errors: [{ type: "save", message: "Template changed since it was loaded. Refresh before saving again." }],
      stale: true,
    };

    expect(resolveTemplateSaveFeedback({ id: "template-a", result: failed })).toEqual({
      successMessage: null,
      errorMessage: "Template not saved: Template changed since it was loaded. Refresh before saving again.",
      navigateToTemplates: false,
      inlineErrors: null,
    });
  });

  it("keeps the usual feedback for a save on the current editor", () => {
    expect(resolveTemplateSaveFeedback({ id: undefined, result: { success: true, errors: [] } })).toEqual({
      successMessage: "Template created",
      errorMessage: null,
      navigateToTemplates: true,
      inlineErrors: [],
    });
    const errors = [{ type: "save", message: "Save failed" }];
    expect(resolveTemplateSaveFeedback({ id: "template-a", result: { success: false, errors } })).toEqual({
      successMessage: null,
      errorMessage: null,
      navigateToTemplates: false,
      inlineErrors: errors,
    });
  });
});
