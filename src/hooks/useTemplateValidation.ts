import { ChecklistSection } from "@/types/checklist";

export interface ValidationError {
  type: string;
  message: string;
}

export const useTemplateValidation = () => {
  const validate = (
    _title: string,
    _sections: ChecklistSection[]
  ): ValidationError[] => {
    // No longer return validation errors - instead we'll provide defaults
    return [];
  };

  // New function to apply defaults instead of validation
  const applyDefaults = (
    title: string,
    sections: ChecklistSection[]
  ): { title: string; sections: ChecklistSection[] } => {
    // Default title if empty
    const defaultTitle = title.trim() || "Untitled Template";
    
    // Ensure at least one section with at least one item
    let defaultSections = [...sections];
    
    if (defaultSections.length === 0) {
      defaultSections = [{
        id: `section-${Date.now()}`,
        title: "Getting Started",
        items: [{
          id: `item-${Date.now()}`,
          title: "First task",
          description: "",
          isCompleted: false
        }]
      }];
    } else {
      // Ensure each section has at least one item
      defaultSections = defaultSections.map((section, sectionIndex: number) => {
        if (section.items.length === 0) {
          return {
            ...section,
            items: [{
              id: `item-${Date.now()}-${sectionIndex}`,
              title: "New task",
              description: "",
              isCompleted: false
            }]
          };
        }
        
        // Auto-generate titles for items without titles
        return {
          ...section,
          items: section.items.map((item, itemIndex: number) => ({
            ...item,
            title: item.title.trim() || `Task ${itemIndex + 1}`
          }))
        };
      });
    }

    return { title: defaultTitle, sections: defaultSections };
  };

  return { validate, applyDefaults };
};