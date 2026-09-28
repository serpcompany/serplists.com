import { z } from "zod";

import { TEMPLATE_EDITOR_TYPES } from "@/lib/forms/templateEditorDetailsForm";
import {
  templateEditorFormSchema,
  type TemplateEditorFormValues,
} from "@/lib/forms/templateEditorForm";

// A new template the API would not save yet (plan limit, ended session), kept while
// the user upgrades or signs in so the new-template editor can restore it afterwards.
// - sessionStorage, not localStorage: it survives the same-tab Stripe and login
//   redirects but ends with the tab, so a shared device does not keep it.
// - The key names the user and the Personal or Organization context, so a draft never
//   opens in another account or context.
// - Storage can be blocked or full; every access is guarded and reports failure.
const DRAFT_KEY_PREFIX = "serplists:template-draft";
const DRAFT_FORMAT = 1;

export type TemplateDraftOwner = { userId: string; teamId?: string | null };
export type TemplateDraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type StoredTemplateDraft = { savedAt: string; values: TemplateEditorFormValues };

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

export const getTemplateDraftKey = ({ userId, teamId }: TemplateDraftOwner): string =>
  `${DRAFT_KEY_PREFIX}:${userId}:${teamId || "personal"}`;

export const getSessionDraftStorage = (): TemplateDraftStorage | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

// True when the draft was stored.
export const saveTemplateDraft = (
  owner: TemplateDraftOwner,
  values: TemplateEditorFormValues,
  storage: TemplateDraftStorage | null = getSessionDraftStorage(),
): boolean => {
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(
      getTemplateDraftKey(owner),
      JSON.stringify({ format: DRAFT_FORMAT, savedAt: new Date().toISOString(), values }),
    );
    return true;
  } catch {
    return false;
  }
};

export const readTemplateDraft = (
  owner: TemplateDraftOwner,
  storage: TemplateDraftStorage | null = getSessionDraftStorage(),
): StoredTemplateDraft | null => {
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(getTemplateDraftKey(owner));
    if (!raw) {
      return null;
    }

    const parsed = storedDraftSchema.safeParse(JSON.parse(raw));
    return parsed.success
      ? { savedAt: parsed.data.savedAt, values: parsed.data.values }
      : null;
  } catch {
    return null;
  }
};

export const clearTemplateDraft = (
  owner: TemplateDraftOwner,
  storage: TemplateDraftStorage | null = getSessionDraftStorage(),
): void => {
  try {
    storage?.removeItem(getTemplateDraftKey(owner));
  } catch {
    // Storage is blocked; there is nothing else to clear.
  }
};
