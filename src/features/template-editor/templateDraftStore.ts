import { z } from "zod";

import { getSessionStorage, succeedsWithoutThrowing } from "@/lib/browserStorage";
import { TEMPLATE_EDITOR_TYPES } from "@/lib/forms/templateEditorDetailsForm";
import {
  templateEditorFormSchema,
  type TemplateEditorFormValues,
} from "@/lib/forms/templateEditorForm";

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
  baseVersion?: number;
};

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
  succeedsWithoutThrowing(() => storage?.removeItem(key));
};

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
