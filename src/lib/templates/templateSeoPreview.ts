import {
  findTemplateEditorSlugIssue,
  normalizeTemplateEditorSlugForSave,
} from "@/lib/forms/templateEditorDetailsForm";
import { buildPublicTemplatePath } from "@/lib/routes";
import { capTemplateSlug, DEFAULT_TEMPLATE_TITLE } from "@/lib/schemas/templateFields";
import { generateSlug } from "@/utils/urlHelpers";

// Used when there is no browser origin (server rendering, tests).
export const TEMPLATE_PUBLIC_URL_FALLBACK_ORIGIN = "https://serplists.com";

type TemplatePreviewSlugInput = {
  // The URL Slug field as typed.
  seoUrl: string;
  // The slug the template has now; absent for a new template.
  storedSlug?: string;
  // The template name as typed: a new template saved with no slug gets one from it.
  title: string;
};

export type TemplateSeoPreviewInput = TemplatePreviewSlugInput & {
  // The owner's public profile slug (resolvePublicTemplateOwnerSlug): the username of
  // the person who created the template, also for an Organization's template. Null when
  // they have no username, so the template has no public URL.
  ownerSlug: string | null;
  origin?: string;
};

export type TemplateSeoPreview =
  | {
      kind: "url";
      slug: string;
      url: string;
      // The save sends this slug, and the API adds a short suffix if another template
      // already has it, so the stored slug can differ.
      mayGetSuffix: boolean;
    }
  | { kind: "needs-username"; slug: string };

// Whose profile the public page sits under: a loaded template's creator, or for a new
// template the signed-in user, who becomes its creator (also in an Organization).
export const resolveTemplateEditorOwnerSlug = (params: {
  isNew: boolean;
  loadedOwnerSlug?: string | null;
  viewerUsername?: string | null;
}): string | null =>
  params.isNew ? params.viewerUsername?.trim() || null : params.loadedOwnerSlug ?? null;

// The slug the template will have after a save, mirroring the save path: the editor
// sends the typed slug normalized (an unchanged stored slug is kept as is), an update
// with no slug keeps the stored one, and a create with no slug gets one built from
// the saved name (functions/api/handlers/templates.ts generateUniqueSlug). A typed slug
// the save refuses (no Latin letters or digits) shows the slug the template has without it.
export const resolveTemplatePreviewSlug = ({
  seoUrl,
  storedSlug,
  title,
}: TemplatePreviewSlugInput): string => {
  const sent = findTemplateEditorSlugIssue(seoUrl, storedSlug)
    ? ""
    : normalizeTemplateEditorSlugForSave(seoUrl, storedSlug);
  if (sent) {
    return sent;
  }

  if (storedSlug) {
    return storedSlug;
  }

  const savedTitle = title.trim() || DEFAULT_TEMPLATE_TITLE;
  return capTemplateSlug(generateSlug(savedTitle)) || "template";
};

// The address the editor's Search & SEO preview shows: the public template page,
// /profile/<owner>/<slug> (the same route and encoding as buildPublicTemplatePath).
export const buildTemplateSeoPreview = (
  input: TemplateSeoPreviewInput,
): TemplateSeoPreview => {
  const slug = resolveTemplatePreviewSlug(input);
  if (!input.ownerSlug) {
    return { kind: "needs-username", slug };
  }

  const origin = input.origin || TEMPLATE_PUBLIC_URL_FALLBACK_ORIGIN;
  return {
    kind: "url",
    slug,
    url: new URL(buildPublicTemplatePath(input.ownerSlug, slug), origin).toString(),
    mayGetSuffix: !input.storedSlug || slug !== input.storedSlug,
  };
};
