import { useState } from "react";
import { useTemplates } from "@/contexts/TemplatesContext";
import { useTemplateValidation } from "@/hooks/useTemplateValidation";
import { type AccessFailure, getAccessFailure, isEditConflictError } from "@/lib/api-errors";
import type { TemplateUpdateResult } from "@/lib/templateUpdateResult";
import { ChecklistSection, TemplateSavePayload } from "@/types/checklist";
import { ValidationError } from "@/hooks/useTemplateValidation";

export type SaveTemplateResult = {
  success: boolean;
  errors: ValidationError[];
  version?: number | undefined;
  slug?: string | undefined;
  saved?: { title: string; sections: ChecklistSection[] };
  failure?: AccessFailure;
  editConflict?: boolean;
};

type SaveTemplateDependencies = {
  createTemplate: (template: Omit<TemplateSavePayload, "id" | "isPublic"> & { isPublic: boolean }) => Promise<unknown>;
  updateTemplate: (template: TemplateSavePayload) => Promise<TemplateUpdateResult | void>;
  applyDefaults: (
    title: string,
    sections: ChecklistSection[],
  ) => { title: string; sections: ChecklistSection[] };
};

export type SaveTemplateInput = {
  id?: string | undefined;
  title: string;
  description: string;
  sections: ChecklistSection[];
  seoTitle: string;
  seoDescription: string;
  seoUrl: string;
  templateType: "checklist" | "recipe";
  categories: string[];
  tags: string[];
  isPublic?: boolean | undefined;
  expectedVersion?: number | undefined;
  storedSlug?: string | undefined;
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
      isPublic: isPublic ?? false,
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
  const { createTemplate, updateTemplate } = useTemplates();
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
