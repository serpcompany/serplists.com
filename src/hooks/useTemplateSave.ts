import { useState } from "react";
import { useTemplateLists } from "@/contexts/TemplatesContext";
import { useTemplateValidation } from "@/hooks/useTemplateValidation";
import { ChecklistSection, TemplateSavePayload } from "@/types/checklist";
import { ValidationError } from "@/hooks/useTemplateValidation";

export type SaveTemplateResult = {
  success: boolean;
  errors: ValidationError[];
};

type SaveTemplateDependencies = {
  getTemplate: (id: string) => TemplateSavePayload | undefined;
  createTemplate: (template: Omit<TemplateSavePayload, "id">) => Promise<unknown>;
  updateTemplate: (template: TemplateSavePayload) => Promise<void>;
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
};

export const persistTemplateSave = async (
  dependencies: SaveTemplateDependencies,
  input: SaveTemplateInput,
): Promise<SaveTemplateResult> => {
  const {
    getTemplate,
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
  } = input;

  const { title: finalTitle, sections: finalSections } = applyDefaults(title, sections);

  try {
    if (id) {
      const existingTemplate = getTemplate(id);
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
        rules: existingTemplate?.rules,
        version: existingTemplate?.version,
      };

      await updateTemplate(updatePayload);
      return { success: true, errors: [] };
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

export const useTemplateSave = () => {
  const { getTemplate, createTemplate, updateTemplate } = useTemplateLists();
  const { applyDefaults } = useTemplateValidation();
  const [isSaving, setIsSaving] = useState(false);

  const saveTemplate = async (
    input: SaveTemplateInput,
  ): Promise<SaveTemplateResult> => {
    setIsSaving(true);

    try {
      return await persistTemplateSave(
        {
          getTemplate,
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
