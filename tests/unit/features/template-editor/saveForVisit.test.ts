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

const createStorage = (): TemplateDraftStorage => {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
};

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

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

// A Free user's create was refused, so the draft was kept. After upgrading they restore
// it, click Save, and leave (answering "Leave anyway?") while it saves. The create then
// succeeds: the draft must go, or the new-template editor offers it back and a second
// save creates a duplicate.
describe("saveTemplateForVisit", () => {
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

  it("clears the kept draft when a create succeeds after the user left", async () => {
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

    // Nothing is left for the page to show or navigate to.
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
