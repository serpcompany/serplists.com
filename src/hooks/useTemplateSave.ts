import { useState } from "react";
import { useTemplateLists } from "@/contexts/TemplatesContext";
import { useTemplateValidation } from "@/hooks/useTemplateValidation";
import { type AccessFailure, getAccessFailure, isEditConflictError } from "@/lib/api-errors";
import { ChecklistSection, TemplateSavePayload, TemplateUpdateResult } from "@/types/checklist";
import { ValidationError } from "@/hooks/useTemplateValidation";

export type SaveTemplateResult = {
  success: boolean;
  errors: ValidationError[];
  // The template's version after a successful update; the next save sends it.
  version?: number;
  // The slug the template has after an update: the one sent (it may carry a suffix)
  // or, when none was sent, the one it kept.
  slug?: string;
  // On success: the title and sections as sent, after defaults were applied (a title,
  // a placeholder task in an empty section, "Task N" titles). That is what was stored,
  // so the editor rebuilds its form from it.
  saved?: { title: string; sections: ChecklistSection[] };
  // Why the API refused the save, kept by kind (sign in, plan gate, billing down) so the
  // editor can offer the way forward instead of only showing the message.
  failure?: AccessFailure;
  // Someone saved the template after this editor loaded it; the editor offers to load
  // the latest version.
  editConflict?: boolean;
};

// Never read the version from the template lists: they refetch in the background and
// would report another editor's newer save as the version this form was built from.
type SaveTemplateDependencies = {
  createTemplate: (template: Omit<TemplateSavePayload, "id">) => Promise<unknown>;
  updateTemplate: (template: TemplateSavePayload) => Promise<TemplateUpdateResult | void>;
  applyDefaults: (
    title: string,
    sections: ChecklistSection[],
  ) => { title: string; sections: ChecklistSection[] };
};

export type SaveTemplateInput = {
  id?: string;
  title: string;
  description: string;
  sections: ChecklistSection[];
  seoTitle: string;
  seoDescription: string;
  seoUrl: string;
  templateType: "checklist" | "recipe";
  categories: string[];
  tags: string[];
  isPublic: boolean;
  // The version the editor loaded (or last saved). Required for updates.
  expectedVersion?: number;
  // The slug the template has now. An unchanged slug is not resent, so a stored slug
  // that predates today's slug rules never blocks a save or moves the URL.
  storedSlug?: string;
};

const MISSING_VERSION_MESSAGE =
  "This template's saved version is unknown. Reload the editor before saving so newer changes are not overwritten.";

export const persistTemplateSave = async (
  dependencies: SaveTemplateDependencies,
  input: SaveTemplateInput,
): Promise<SaveTemplateResult> => {
  const {
    createTemplate,
    updateTemplate,
    applyDefaults,
  } = dependencies;
  const {
    id,
    title,
    description,
    sections,
    seoTitle,
    seoDescription,
    seoUrl,
    templateType,
    categories,
    tags,
    isPublic,
    expectedVersion,
    storedSlug,
  } = input;

  const { title: finalTitle, sections: finalSections } = applyDefaults(title, sections);
  const saved = { title: finalTitle, sections: finalSections };

  try {
    if (id) {
      if (typeof expectedVersion !== "number") {
        return { success: false, errors: [{ type: "save", message: MISSING_VERSION_MESSAGE }] };
      }

      // Rules are not edited here; leaving them out keeps the stored rules. Likewise an
      // empty or unchanged slug is left out and the stored slug is kept.
      const changedSlug = seoUrl && seoUrl !== storedSlug ? seoUrl : undefined;
      const updatePayload: TemplateSavePayload = {
        id,
        title: finalTitle,
        description,
        sections: finalSections,
        seoTitle,
        seoDescription,
        seoUrl: changedSlug,
        slug: changedSlug,
        type: templateType,
        categories,
        tags,
        isPublic,
        version: expectedVersion,
      };

      const updated = await updateTemplate(updatePayload);
      return { success: true, errors: [], version: updated?.version, slug: updated?.slug, saved };
    }

    await createTemplate({
      title: finalTitle,
      description,
      sections: finalSections,
      seoTitle,
      seoDescription,
      seoUrl,
      type: templateType,
      categories,
      tags,
      isPublic,
    });

    return { success: true, errors: [], saved };
  } catch (error) {
    console.error("Error saving template:", error);
    const failure = getAccessFailure(error, "Failed to save template");
    return {
      success: false,
      errors: [{ type: "save", message: failure.message }],
      failure,
      ...(isEditConflictError(error) ? { editConflict: true } : {}),
    };
  }
};

export const useTemplateSave = () => {
  const { createTemplate, updateTemplate } = useTemplateLists();
  const { applyDefaults } = useTemplateValidation();
  const [isSaving, setIsSaving] = useState(false);

  const saveTemplate = async (
    input: SaveTemplateInput,
  ): Promise<SaveTemplateResult> => {
    setIsSaving(true);

    try {
      return await persistTemplateSave(
        {
          createTemplate,
          updateTemplate,
          applyDefaults,
        },
        input,
      );
    } finally {
      setIsSaving(false);
    }
  };

  return {
    saveTemplate,
    isSaving
  };
};
