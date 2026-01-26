import { useState, useEffect, useMemo } from "react";
import { useTemplates } from "@/contexts/TemplatesContext";
import { getPredefinedCategories } from "@/utils/categories";

export const useTemplateLibrary = (category?: string, templateType?: "checklist" | "recipe") => {
  const { templates: contextTemplates, templatesLoading } = useTemplates();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const loading = templatesLoading ?? false;

  // Filter to only public templates
  const templates = useMemo(() => {
    const publicTemplates = contextTemplates.filter(t => t.isPublic === true);
    if (!templateType) return publicTemplates;
    return publicTemplates.filter(t => t.type === templateType);
  }, [contextTemplates, templateType]);

  useEffect(() => {
    // Extract all unique categories and combine with predefined ones
    const categories = new Set<string>();
    const predefinedCategories = getPredefinedCategories();
    
    // Add predefined categories first
    predefinedCategories.forEach(cat => categories.add(cat));
    
    // Add categories from templates
    templates.forEach(template => {
      if (template.categories) {
        template.categories.forEach(cat => categories.add(cat));
      }
    });
    
    const allCategoriesArray = Array.from(categories).sort();
    setAllCategories(allCategoriesArray);
  }, [templates]);

  const fetchTemplates = async () => {
    // Templates are already loaded from context, no need to fetch
  };

  const filteredTemplates = useMemo(() => {
    let filtered = templates;

    // Filter by category if specified in URL
    if (category) {
      filtered = filtered.filter(template => 
        template.categories?.includes(category)
      );
    }

    // Filter by selected categories from multi-select
    if (selectedCategories.length > 0) {
      filtered = filtered.filter(template => 
        selectedCategories.some(selectedCat => 
          template.categories?.includes(selectedCat)
        )
      );
    }

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(template =>
        template.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.categories?.some((cat: string) => cat.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    return filtered;
  }, [templates, category, searchQuery, selectedCategories]);

  return {
    templates,
    filteredTemplates,
    loading,
    searchQuery,
    setSearchQuery,
    selectedCategories,
    setSelectedCategories,
    allCategories,
    fetchTemplates,
  };
};
