import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTemplates } from "@/contexts/TemplatesContext";
import { useTemplateValidation } from "@/hooks/useTemplateValidation";
import { ChecklistTemplate, ChecklistSection } from "@/types/checklist";
import { toast } from "sonner";

export const useTemplateSave = () => {
  const navigate = useNavigate();
  const { getTemplate, createTemplate, updateTemplate } = useTemplates();
  const { applyDefaults } = useTemplateValidation();
  const [isSaving, setIsSaving] = useState(false);

  const saveTemplate = async (
    id: string | undefined,
    title: string,
    description: string,
    sections: ChecklistSection[],
    seoTitle: string,
    seoDescription: string,
    seoUrl: string,
    templateType: "checklist" | "recipe",
    categories: string[],
    tags: string[],
    isPublic: boolean = true
  ) => {
    // Apply defaults instead of validation
    const { title: finalTitle, sections: finalSections } = applyDefaults(title, sections);
    
    setIsSaving(true);
    
    try {
      if (id) {
        const template = getTemplate(id);
        if (template) {
          console.log('Before update - Categories:', categories, 'Tags:', tags);
          const updatedTemplate: ChecklistTemplate = {
            ...template,
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
          };
          
          console.log('Updated template object:', updatedTemplate);
          console.log('Updating template with categories:', categories, 'and tags:', tags);
          updateTemplate(updatedTemplate);
          toast.success("Template updated successfully");
          // Don't navigate away, stay on the editing page
        }
      } else {
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
        
        toast.success("Template created successfully");
        navigate("/templates");
      }
      
      return { success: true, errors: [] };
    } catch (error) {
      console.error("Error saving template:", error);
      toast.error("Failed to save template");
      return { success: false, errors: [] };
    } finally {
      setIsSaving(false);
    }
  };

  return {
    saveTemplate,
    isSaving
  };
};
