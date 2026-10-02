import { describe, expect, it, vi } from "vitest";

import { saveTemplateForVisit } from "@/features/template-editor/saveForVisit";
import {
  readTemplateDraft,
  saveTemplateDraft,
  settleTemplateDraftAfterSave,
  type TemplateDraftStorage,
} from "@/features/template-editor/templateDraftStore";
import type { SaveTemplateResult } from "@/hooks/useTemplateSave";
import { buildTemplateEditorFormValues } from "@/lib/forms/templateEditorForm";
import { createPageVisitTracker } from "@/lib/navigation/pageVisit";

import { memoryStorage as createStorage } from "../../../fixtures/memoryStorage";
import { deferred } from "../../../support/deferred";

const draftValues = buildTemplateEditorFormValues({
  title: "Launch checklist",
  sections: [
    {
      id: "section-1",
      title: "Prep",
      items: [{ id: "item-1", title: "Write the brief", description: "" }],
    },
  ],
});

describe("saveTemplateForVisit when a restored draft's create succeeds after the user left, so the editor never offers it back for a duplicate save", () => {
  const owner = { userId: "u1" };

  const shownPage = () => {
    const tracker = createPageVisitTracker();
    tracker.enter();
    return tracker;
  };

  const settleWith = (storage: TemplateDraftStorage) => (result: SaveTemplateResult) =>
    settleTemplateDraftAfterSave(
      owner,
      { saved: result.success, keepDraft: false, values: draftValues },
      storage,
    );

  it("clears the kept draft, and gives the left page no result, when a create succeeds after the user left", async () => {
    const storage = createStorage();
    saveTemplateDraft(owner, draftValues, storage);
    const tracker = shownPage();
    const request = deferred<SaveTemplateResult>();

    const pending = saveTemplateForVisit({
      visit: tracker.begin(),
      save: () => request.promise,
      settle: settleWith(storage),
    });
    tracker.leave();
    request.resolve({ success: true, errors: [] });

    await expect(pending).resolves.toBeNull();
    expect(readTemplateDraft(owner, storage)).toBeNull();
  });

  it("returns the result while the user is still on the page", async () => {
    const storage = createStorage();
    saveTemplateDraft(owner, draftValues, storage);
    const settle = vi.fn(settleWith(storage));
    const result: SaveTemplateResult = { success: true, errors: [] };

    await expect(
      saveTemplateForVisit({
        visit: shownPage().begin(),
        save: () => Promise.resolve(result),
        settle,
      }),
    ).resolves.toBe(result);
    expect(settle).toHaveBeenCalledWith(result);
    expect(readTemplateDraft(owner, storage)).toBeNull();
  });
});
