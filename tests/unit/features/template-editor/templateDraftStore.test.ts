import { describe, expect, it } from "vitest";

import {
  clearTemplateDraft,
  clearTemplateEditDraft,
  getTemplateDraftKey,
  getTemplateEditDraftKey,
  readTemplateDraft,
  readTemplateEditDraft,
  saveTemplateDraft,
  saveTemplateEditDraft,
  settleTemplateDraftAfterSave,
  type TemplateDraftStorage,
} from "@/features/template-editor/templateDraftStore";
import { buildTemplateEditorFormValues } from "@/lib/forms/templateEditorForm";

const createStorage = (): TemplateDraftStorage & { items: Map<string, string> } => {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
};

const throwingStorage: TemplateDraftStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

const draftValues = buildTemplateEditorFormValues({
  title: "Launch checklist",
  sections: [
    {
      id: "section-1",
      title: "Prep",
      items: [{ id: "item-1", title: "Write the brief", description: "Ten minutes of work" }],
    },
  ],
});

describe("template draft store", () => {
  it("restores a draft for the same user and context", () => {
    const storage = createStorage();
    const owner = { userId: "u1" };

    expect(saveTemplateDraft(owner, draftValues, storage)).toBe(true);

    expect(readTemplateDraft(owner, storage)?.values).toEqual(draftValues);
  });

  it("never restores a draft into another user or context", () => {
    const storage = createStorage();
    saveTemplateDraft({ userId: "u1" }, draftValues, storage);

    expect(readTemplateDraft({ userId: "u2" }, storage)).toBeNull();
    expect(readTemplateDraft({ userId: "u1", teamId: "team-1" }, storage)).toBeNull();
    expect(getTemplateDraftKey({ userId: "u1" })).not.toBe(
      getTemplateDraftKey({ userId: "u1", teamId: "team-1" }),
    );
  });

  it("ignores a stored value that is not a draft", () => {
    const storage = createStorage();
    storage.setItem(getTemplateDraftKey({ userId: "u1" }), "{not json");
    expect(readTemplateDraft({ userId: "u1" }, storage)).toBeNull();

    storage.setItem(getTemplateDraftKey({ userId: "u1" }), JSON.stringify({ values: 42 }));
    expect(readTemplateDraft({ userId: "u1" }, storage)).toBeNull();
  });

  it("clears the draft", () => {
    const storage = createStorage();
    saveTemplateDraft({ userId: "u1" }, draftValues, storage);

    clearTemplateDraft({ userId: "u1" }, storage);

    expect(readTemplateDraft({ userId: "u1" }, storage)).toBeNull();
  });

  it("reports failure instead of throwing when storage is blocked or full", () => {
    expect(saveTemplateDraft({ userId: "u1" }, draftValues, throwingStorage)).toBe(false);
    expect(readTemplateDraft({ userId: "u1" }, throwingStorage)).toBeNull();
    expect(() => clearTemplateDraft({ userId: "u1" }, throwingStorage)).not.toThrow();
    expect(saveTemplateDraft({ userId: "u1" }, draftValues, null)).toBe(false);
  });
});

describe("settling the draft after a new template's save", () => {
  const owner = { userId: "u1" };

  it("clears the kept draft once the template is saved", () => {
    const storage = createStorage();
    saveTemplateDraft(owner, draftValues, storage);

    settleTemplateDraftAfterSave(
      owner,
      { saved: true, keepDraft: false, values: draftValues },
      storage,
    );

    expect(readTemplateDraft(owner, storage)).toBeNull();
  });

  it("keeps the values that were sent when the save needs an upgrade or sign-in", () => {
    const storage = createStorage();

    settleTemplateDraftAfterSave(
      owner,
      { saved: false, keepDraft: true, values: draftValues },
      storage,
    );

    expect(readTemplateDraft(owner, storage)?.values).toEqual(draftValues);
  });

  it("leaves a kept draft alone after any other failure", () => {
    const storage = createStorage();
    saveTemplateDraft(owner, draftValues, storage);
    const otherValues = { ...draftValues, title: "Something else" };

    settleTemplateDraftAfterSave(
      owner,
      { saved: false, keepDraft: false, values: otherValues },
      storage,
    );

    expect(readTemplateDraft(owner, storage)?.values).toEqual(draftValues);
  });
});

// Edits to an existing template, kept when the session ended before they were saved.
describe("existing template drafts", () => {
  const owner = { userId: "u1", templateId: "template-1" };

  it("keeps the edits with the version they were made on", () => {
    const storage = createStorage();

    expect(saveTemplateEditDraft(owner, { values: draftValues, baseVersion: 7 }, storage)).toBe(true);

    const draft = readTemplateEditDraft(owner, storage);
    expect(draft?.values).toEqual(draftValues);
    expect(draft?.baseVersion).toBe(7);
  });

  it("never offers the edits to another user or on another template", () => {
    const storage = createStorage();
    saveTemplateEditDraft(owner, { values: draftValues, baseVersion: 7 }, storage);

    expect(readTemplateEditDraft({ userId: "u2", templateId: "template-1" }, storage)).toBeNull();
    expect(readTemplateEditDraft({ userId: "u1", templateId: "template-2" }, storage)).toBeNull();
    // Nor as a new template's draft.
    expect(readTemplateDraft({ userId: "u1" }, storage)).toBeNull();
    expect(getTemplateEditDraftKey(owner)).not.toBe(getTemplateDraftKey({ userId: "u1" }));
  });

  it("keeps edits to a template that has no version yet", () => {
    const storage = createStorage();
    saveTemplateEditDraft(owner, { values: draftValues }, storage);

    expect(readTemplateEditDraft(owner, storage)?.baseVersion).toBeUndefined();
  });

  it("clears the edits, and reports failure when storage is blocked", () => {
    const storage = createStorage();
    saveTemplateEditDraft(owner, { values: draftValues, baseVersion: 7 }, storage);

    clearTemplateEditDraft(owner, storage);

    expect(readTemplateEditDraft(owner, storage)).toBeNull();
    expect(saveTemplateEditDraft(owner, { values: draftValues }, throwingStorage)).toBe(false);
    expect(readTemplateEditDraft(owner, throwingStorage)).toBeNull();
    expect(() => clearTemplateEditDraft(owner, throwingStorage)).not.toThrow();
  });
});
