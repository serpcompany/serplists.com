import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  applyTemplateEditorSave,
  buildTemplateEditorSavedState,
  loadTemplateEditorData,
  saveTemplateEditorData,
} from "@/features/template-editor/useTemplateEditorModel";
import { persistTemplateSave, type SaveTemplateInput } from "@/hooks/useTemplateSave";
import { createApiError } from "@/lib/api-errors";
import type { ChecklistSection, TemplateSavePayload } from "@/types/checklist";

// The editor used to read version and rules from the whole workspace list, and each save
// waited for that list to reload so the next save had the new version. It now loads the
// template by id and keeps the version the PUT answer returns.

const rules = [{ id: "rule-1", type: "required-field", path: "sections[].items[].title", severity: "warning" }];
const storedTemplate = {
  id: "template-1",
  title: "Camping Checklist",
  description: "Pack the essentials.",
  type: "checklist",
  sections: [{ id: "section-1", title: "Prep", items: [{ id: "item-1", title: "Bring tent", description: "" }] }],
  user_id: "user-1",
  is_public: false,
  slug: "camping-checklist",
  version: 3,
  rules,
};

const setup = (updates: Array<{ version: number; slug?: string } | Error>) => {
  const apiClient = { getTemplateById: vi.fn().mockResolvedValue(storedTemplate) };
  const updateTemplate = vi.fn<(payload: TemplateSavePayload) => Promise<{ version: number; slug?: string }>>();
  for (const update of updates) {
    if (update instanceof Error) updateTemplate.mockRejectedValueOnce(update);
    else updateTemplate.mockResolvedValueOnce(update);
  }
  const saveTemplate = (input: SaveTemplateInput) =>
    persistTemplateSave(
      {
        createTemplate: vi.fn(),
        updateTemplate,
        applyDefaults: (title: string, sections: ChecklistSection[]) => ({ title, sections }),
      },
      input,
    );
  return { apiClient, updateTemplate, saveTemplate };
};

describe("template editor versions", () => {
  it("loads the template by id and keeps its version and rules for the save", async () => {
    const { apiClient } = setup([]);

    const loaded = await loadTemplateEditorData({ id: "template-1" }, { apiClient });

    expect(apiClient.getTemplateById).toHaveBeenCalledWith("template-1");
    expect(loaded.baseline).toEqual({ version: 3, rules });
  });

  it("sends the version the previous save returned, so consecutive saves all succeed", async () => {
    const { apiClient, updateTemplate, saveTemplate } = setup([
      { version: 4, slug: "camping-checklist" },
      { version: 5, slug: "camping-checklist" },
    ]);
    const loaded = await loadTemplateEditorData({ id: "template-1" }, { apiClient });

    let baseline = loaded.baseline;
    const first = await saveTemplateEditorData(
      { id: "template-1", values: { ...loaded.initialValues, title: "Camping v2" }, baseline },
      { saveTemplate },
    );
    baseline = applyTemplateEditorSave(baseline, first);
    const second = await saveTemplateEditorData(
      { id: "template-1", values: { ...loaded.initialValues, title: "Camping v3" }, baseline },
      { saveTemplate },
    );

    expect(first.success && second.success).toBe(true);
    expect(updateTemplate.mock.calls[0][0]).toMatchObject({ version: 3, rules, title: "Camping v2" });
    expect(updateTemplate.mock.calls[1][0]).toMatchObject({ version: 4, rules, title: "Camping v3" });
    expect(applyTemplateEditorSave(baseline, second)).toEqual({ version: 5, rules });
  });

  it("keeps the loaded version after a conflict, so the conflict is not hidden", async () => {
    const conflict = createApiError(409, {
      error: "Template changed since it was loaded. Refresh before saving again.",
      code: "edit_conflict",
    });
    const { apiClient, saveTemplate } = setup([conflict]);
    const loaded = await loadTemplateEditorData({ id: "template-1" }, { apiClient });

    const result = await saveTemplateEditorData(
      { id: "template-1", values: loaded.initialValues, baseline: loaded.baseline },
      { saveTemplate },
    );

    expect(result.success).toBe(false);
    expect(applyTemplateEditorSave(loaded.baseline, result)).toEqual(loaded.baseline);
  });

  it("leaves rules out when the template has none, instead of clearing them", async () => {
    const { apiClient, updateTemplate, saveTemplate } = setup([{ version: 4 }]);
    apiClient.getTemplateById.mockResolvedValueOnce({ ...storedTemplate, rules: undefined });
    const loaded = await loadTemplateEditorData({ id: "template-1" }, { apiClient });

    await saveTemplateEditorData({ id: "template-1", values: loaded.initialValues, baseline: loaded.baseline }, { saveTemplate });

    expect(updateTemplate.mock.calls[0][0].rules).toBeUndefined();
  });

  it("shows the slug the server stored, including a suffix added after a conflict", () => {
    const values = {
      title: "Camping",
      description: "",
      templateType: "checklist" as const,
      categories: [],
      tags: [],
      isPublic: false,
      seoTitle: "",
      seoDescription: "",
      seoUrl: "taken-slug",
      sections: [],
    };

    const saved = buildTemplateEditorSavedState(values, { version: 4, slug: "taken-slug-template" });

    expect(saved.templateSlug).toBe("taken-slug-template");
    expect(saved.initialValues.seoUrl).toBe("taken-slug-template");
  });

  it("never subscribes the editor to the workspace list", () => {
    for (const file of ["src/features/template-editor/useTemplateEditorModel.ts", "src/hooks/useTemplateSave.ts"]) {
      const source = readFileSync(path.resolve(__dirname, "../../../..", file), "utf8");
      expect(source, file).not.toMatch(/useTemplateLists/);
    }
  });
});
