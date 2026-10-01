import {
  findTemplateEditorSlugIssue,
  normalizeTemplateEditorSlugForSave,
} from "@/lib/forms/templateEditorDetailsForm";
import { buildPublicTemplatePath } from "@/lib/routes";
import { capTemplateSlug, DEFAULT_TEMPLATE_TITLE } from "@/lib/schemas/templateFields";
import { CANONICAL_ORIGIN } from "@/lib/seo/siteOrigin";
import { generateSlug } from "@/utils/urlHelpers";

export const TEMPLATE_PUBLIC_URL_FALLBACK_ORIGIN = CANONICAL_ORIGIN;

type TemplatePreviewSlugInput = {
  seoUrl: string;
  storedSlug?: string;
  title: string;
};

export type TemplateSeoPreviewInput = TemplatePreviewSlugInput & {
  ownerSlug: string | null;
  origin?: string;
};

export type TemplateSeoPreview =
  | {
      kind: "url";
      slug: string;
      url: string;
      mayGetSuffix: boolean;
    }
  | { kind: "needs-username"; slug: string };

export const resolveTemplateEditorOwnerSlug = (params: {
  isNew: boolean;
  loadedOwnerSlug?: string | null;
  viewerUsername?: string | null;
}): string | null =>
  params.isNew ? params.viewerUsername?.trim() || null : params.loadedOwnerSlug ?? null;

const slugTheSaveSends = (seoUrl: string, storedSlug: string | undefined): string =>
  findTemplateEditorSlugIssue(seoUrl, storedSlug) ? "" : normalizeTemplateEditorSlugForSave(seoUrl, storedSlug);

export const resolveTemplatePreviewSlug = ({
  seoUrl,
  storedSlug,
  title,
}: TemplatePreviewSlugInput): string => {
  const sent = slugTheSaveSends(seoUrl, storedSlug);
  if (sent) {
    return sent;
  }

  if (storedSlug) {
    return storedSlug;
  }

  const savedTitle = title.trim() || DEFAULT_TEMPLATE_TITLE;
  return capTemplateSlug(generateSlug(savedTitle)) || "template";
};

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
