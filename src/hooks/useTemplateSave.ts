import { useState } from "react";
import { useTemplates } from "@/contexts/TemplatesContext";
import { useTemplateValidation } from "@/hooks/useTemplateValidation";
import type { TemplateUpdateResult } from "@/lib/templateUpdateResult";
import { ChecklistSection, TemplateRule, TemplateSavePayload } from "@/types/checklist";
import { ValidationError } from "@/hooks/useTemplateValidation";

export type SaveTemplateResult = {
  success: boolean;
  errors: ValidationError[];
  // An update's stored version and slug, which the editor keeps for its next save.
  saved?: TemplateUpdateResult;
};

type SaveTemplateDependencies = {
  createTemplate: (template: Omit<TemplateSavePayload, "id">) => Promise<unknown>;
  updateTemplate: (template: TemplateSavePayload) => Promise<TemplateUpdateResult>;
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
  // From the template the editor loaded by id (or its last save): sent as expected_version,
  // and rules are kept as they are. Undefined rules leave the key out, so nothing is cleared.
  version?: number;
  rules?: TemplateRule[];
};

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
    version,
    rules,
  } = input;

  const { title: finalTitle, sections: finalSections } = applyDefaults(title, sections);

  try {
    if (id) {
      const updatePayload: TemplateSavePayload = {
        id,
        title: finalTitle,
        description,
        sections: finalSections,
        seoTitle,
        seoDescription,
        seoUrl,
        slug: seoUrl,
        type: templateType,
        categories,
        tags,
        isPublic,
        rules,
        version,
      };

      const saved = await updateTemplate(updatePayload);
      return { success: true, errors: [], saved };
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

    return { success: true, errors: [] };
  } catch (error) {
    console.error("Error saving template:", error);
    return {
      success: false,
      errors: [
        {
          type: "save",
          message:
            error instanceof Error ? error.message : "Failed to save template",
        },
      ],
    };
  }
};

// Only the mutations: the editor loads its template by id and never subscribes to a list.
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
