import { z } from "zod";

import { getSessionStorage } from "@/lib/browserStorage";
import { TEMPLATE_EDITOR_TYPES } from "@/lib/forms/templateEditorDetailsForm";
import {
  templateEditorFormSchema,
  type TemplateEditorFormValues,
} from "@/lib/forms/templateEditorForm";

// A new template the API would not save yet (plan limit, ended session), kept while
// the user upgrades or signs in so the new-template editor can restore it afterwards.
// Edits to an existing template are kept the same way when the session ends before
// they are saved (a sign-out in another tab, an expired session), with the version
// they were made on, so a save made since then ends in a conflict, not an overwrite.
// - sessionStorage, not localStorage: it survives the same-tab Stripe and login
//   redirects but ends with the tab, so a shared device does not keep it.
// - The key names the user and the Personal or Organization context, so a draft never
//   opens in another account or context.
// - Storage can be blocked or full; every access is guarded and reports failure.
const DRAFT_KEY_PREFIX = "serplists:template-draft";
const EDIT_DRAFT_KEY_PREFIX = "serplists:template-edit-draft";
const DRAFT_FORMAT = 1;

export type TemplateDraftOwner = { userId: string; teamId?: string | null };
export type TemplateEditDraftOwner = { userId: string; templateId: string };
export type TemplateDraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type TemplateDraftListStorage = Pick<Storage, "getItem" | "key" | "length">;
export type StoredTemplateDraft = {
  savedAt: string;
  values: TemplateEditorFormValues;
  // Edits to an existing template: the version they were made on.
  baseVersion?: number;
};

// Structure only: field limits are checked again when the restored draft is saved.
const storedDraftSchema = z.object({
  format: z.literal(DRAFT_FORMAT),
  savedAt: z.string(),
  values: z.object({
    title: z.string(),
    description: z.string(),
    templateType: z.enum(TEMPLATE_EDITOR_TYPES),
    categories: z.array(z.string()),
    tags: z.array(z.string()),
    isPublic: z.boolean(),
    seoTitle: z.string(),
    seoDescription: z.string(),
    seoUrl: z.string(),
    sections: templateEditorFormSchema.shape.sections,
  }),
});

const storedEditDraftSchema = storedDraftSchema.extend({
  baseVersion: z.number().nullable(),
});

export const getTemplateDraftKey = ({ userId, teamId }: TemplateDraftOwner): string =>
  `${DRAFT_KEY_PREFIX}:${userId}:${teamId || "personal"}`;

export const getTemplateEditDraftKey = ({ userId, templateId }: TemplateEditDraftOwner): string =>
  `${EDIT_DRAFT_KEY_PREFIX}:${userId}:${templateId}`;

export const getSessionDraftStorage = (): TemplateDraftStorage | null => getSessionStorage() ?? null;

const writeDraft = (
  key: string,
  draft: Record<string, unknown>,
  storage: TemplateDraftStorage | null,
): boolean => {
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(
      key,
      JSON.stringify({ format: DRAFT_FORMAT, savedAt: new Date().toISOString(), ...draft }),
    );
    return true;
  } catch {
    return false;
  }
};

const readDraft = <T>(
  key: string,
  schema: z.ZodType<T>,
  storage: Pick<Storage, "getItem"> | null,
): T | null => {
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

const removeDraft = (key: string, storage: TemplateDraftStorage | null): void => {
  try {
    storage?.removeItem(key);
  } catch {
    // Storage is blocked; there is nothing else to clear.
  }
};

// True when the draft was stored.
export const saveTemplateDraft = (
  owner: TemplateDraftOwner,
  values: TemplateEditorFormValues,
  storage: TemplateDraftStorage | null = getSessionDraftStorage(),
): boolean => writeDraft(getTemplateDraftKey(owner), { values }, storage);

export const readTemplateDraft = (
  owner: TemplateDraftOwner,
  storage: TemplateDraftStorage | null = getSessionDraftStorage(),
): StoredTemplateDraft | null => {
  const draft = readDraft(getTemplateDraftKey(owner), storedDraftSchema, storage);
  return draft ? { savedAt: draft.savedAt, values: draft.values } : null;
};

// This user's new-template drafts in every context, newest first. A confirmed sign-out
// returns the tab to Personal, so after sign-in a draft kept in an Organization is only
// found this way. The key prefix names the user, so no other account's drafts match.
export const listTemplateDraftContexts = (
  userId: string,
  storage: TemplateDraftListStorage | null = getSessionStorage() ?? null,
): Array<{ teamId: string | null; draft: StoredTemplateDraft }> => {
  const prefix = `${DRAFT_KEY_PREFIX}:${userId}:`;
  const keys: string[] = [];
  try {
    for (let index = 0; storage && index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }
  } catch {
    return [];
  }

  return keys
    .flatMap((key) => {
      const contextId = key.slice(prefix.length);
      const draft = readDraft(key, storedDraftSchema, storage);
      return draft
        ? [{
            teamId: contextId === "personal" ? null : contextId,
            draft: { savedAt: draft.savedAt, values: draft.values },
          }]
        : [];
    })
    .sort((a, b) => b.draft.savedAt.localeCompare(a.draft.savedAt));
};

export const clearTemplateDraft = (
  owner: TemplateDraftOwner,
  storage: TemplateDraftStorage | null = getSessionDraftStorage(),
): void => removeDraft(getTemplateDraftKey(owner), storage);

// True when the edits were stored.
export const saveTemplateEditDraft = (
  owner: TemplateEditDraftOwner,
  draft: { values: TemplateEditorFormValues; baseVersion?: number },
  storage: TemplateDraftStorage | null = getSessionDraftStorage(),
): boolean =>
  writeDraft(
    getTemplateEditDraftKey(owner),
    { values: draft.values, baseVersion: draft.baseVersion ?? null },
    storage,
  );

export const readTemplateEditDraft = (
  owner: TemplateEditDraftOwner,
  storage: TemplateDraftStorage | null = getSessionDraftStorage(),
): StoredTemplateDraft | null => {
  const draft = readDraft(getTemplateEditDraftKey(owner), storedEditDraftSchema, storage);
  return draft
    ? { savedAt: draft.savedAt, values: draft.values, baseVersion: draft.baseVersion ?? undefined }
    : null;
};

export const clearTemplateEditDraft = (
  owner: TemplateEditDraftOwner,
  storage: TemplateDraftStorage | null = getSessionDraftStorage(),
): void => removeDraft(getTemplateEditDraftKey(owner), storage);

// A new template's save has finished, whether or not the editor is still open (the
// user can leave while it saves). A saved template clears its draft: restoring it
// would create a duplicate. A save refused for a reason the user fixes elsewhere
// (upgrade, sign in) keeps the values it sent. Any other failure leaves storage alone.
export const settleTemplateDraftAfterSave = (
  owner: TemplateDraftOwner,
  outcome: { saved: boolean; keepDraft: boolean; values: TemplateEditorFormValues },
  storage: TemplateDraftStorage | null = getSessionDraftStorage(),
): void => {
  if (outcome.saved) {
    clearTemplateDraft(owner, storage);
  } else if (outcome.keepDraft) {
    saveTemplateDraft(owner, outcome.values, storage);
  }
};
