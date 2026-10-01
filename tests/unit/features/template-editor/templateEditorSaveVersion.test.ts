import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const listSubscriptions = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/TemplatesContext", () => ({
  useTemplates: () => ({ createTemplate: vi.fn(), updateTemplate: vi.fn() }),
  useTemplateLists: listSubscriptions,
}));

import {
  buildTemplateEditorSavedState,
  loadTemplateEditorData,
  saveTemplateEditorData,
  useTemplateEditorModel,
} from "@/features/template-editor/useTemplateEditorModel";
import { persistTemplateSave, useTemplateSave, type SaveTemplateInput } from "@/hooks/useTemplateSave";
import { createApiError } from "@/lib/api-errors";
import type { ChecklistSection, TemplateSavePayload } from "@/types/checklist";

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
  it("loads the template by id and keeps its version for the save", async () => {
    const { apiClient } = setup([]);

    const loaded = await loadTemplateEditorData({ id: "template-1" }, { apiClient });

    expect(apiClient.getTemplateById).toHaveBeenCalledWith("template-1");
    expect(loaded.version).toBe(3);
  });

  it("sends the version the previous save returned, so consecutive saves all succeed", async () => {
    const { apiClient, updateTemplate, saveTemplate } = setup([
      { version: 4, slug: "camping-checklist" },
      { version: 5, slug: "camping-checklist" },
    ]);
    const loaded = await loadTemplateEditorData({ id: "template-1" }, { apiClient });

    const first = await saveTemplateEditorData(
      {
        id: "template-1",
        expectedVersion: loaded.version,
        storedSlug: loaded.templateSlug,
        values: { ...loaded.initialValues, title: "Camping v2" },
      },
      { saveTemplate },
    );
    const second = await saveTemplateEditorData(
      {
        id: "template-1",
        expectedVersion: first.version,
        storedSlug: first.slug,
        values: { ...loaded.initialValues, title: "Camping v3" },
      },
      { saveTemplate },
    );

    expect(first.success && second.success).toBe(true);
    expect(updateTemplate.mock.calls[0][0]).toMatchObject({ version: 3, title: "Camping v2" });
    expect(updateTemplate.mock.calls[1][0]).toMatchObject({ version: 4, title: "Camping v3" });
    expect(second.version).toBe(5);
  });

  it("reports no new version after a conflict, so the loaded one is kept and the conflict is not hidden", async () => {
    const conflict = createApiError(409, {
      error: "Template changed since it was loaded. Refresh before saving again.",
      code: "edit_conflict",
    });
    const { apiClient, saveTemplate } = setup([conflict]);
    const loaded = await loadTemplateEditorData({ id: "template-1" }, { apiClient });

    const result = await saveTemplateEditorData(
      { id: "template-1", expectedVersion: loaded.version, values: loaded.initialValues },
      { saveTemplate },
    );

    expect(result.success).toBe(false);
    expect(result.editConflict).toBe(true);
    expect(result.version).toBeUndefined();
  });

  it("leaves rules out of the save, so the stored rules are kept rather than cleared", async () => {
    const { apiClient, updateTemplate, saveTemplate } = setup([{ version: 4 }, { version: 5 }]);
    const loaded = await loadTemplateEditorData({ id: "template-1" }, { apiClient });
    apiClient.getTemplateById.mockResolvedValueOnce({ ...storedTemplate, rules: undefined });
    const loadedWithoutRules = await loadTemplateEditorData({ id: "template-1" }, { apiClient });

    await saveTemplateEditorData(
      { id: "template-1", expectedVersion: loaded.version, values: loaded.initialValues },
      { saveTemplate },
    );
    await saveTemplateEditorData(
      { id: "template-1", expectedVersion: loadedWithoutRules.version, values: loadedWithoutRules.initialValues },
      { saveTemplate },
    );

    expect(updateTemplate.mock.calls[0][0]).not.toHaveProperty("rules");
    expect(updateTemplate.mock.calls[1][0]).not.toHaveProperty("rules");
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

    const saved = buildTemplateEditorSavedState(values, { savedSlug: "taken-slug-template" });

    expect(saved.templateSlug).toBe("taken-slug-template");
    expect(saved.initialValues.seoUrl).toBe("taken-slug-template");
  });

  it("never subscribes the editor to the workspace list", () => {
    function EditorLoadingAndSavingATemplate() {
      useTemplateEditorModel({ id: "template-1" });
      useTemplateSave();
      return null;
    }

    renderToStaticMarkup(createElement(EditorLoadingAndSavingATemplate));

    expect(listSubscriptions).not.toHaveBeenCalled();
  });
});
