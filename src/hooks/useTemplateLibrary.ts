import { useState, useMemo } from "react";
import { useTemplateLists } from "@/contexts/TemplatesContext";
import { buildCategorySlug } from "@/lib/routes";
import { getPredefinedCategories } from "@/utils/categories";

export const useTemplateLibrary = (category?: string, templateType?: "checklist" | "recipe") => {
  const {
    templates: contextTemplates,
    catalogPending,
    catalogError,
    refetchCatalog,
  } = useTemplateLists({ catalog: true, workspace: false });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Filter to only public templates
  const templates = useMemo(() => {
    const publicTemplates = contextTemplates.filter(t => t.isPublic === true);
    if (!templateType) return publicTemplates;
    return publicTemplates.filter(t => t.type === templateType);
  }, [contextTemplates, templateType]);

  // The bundled repo templates are always listed, so loading comes from the catalog query
  // itself. Pages must not treat a category or search as empty until it has loaded.
  const loading = catalogPending;
  const retryCatalog = () => {
    void refetchCatalog();
  };

  // Predefined categories plus every template category, ready on the first render.
  const allCategories = useMemo(() => {
    const categories = new Set<string>(getPredefinedCategories());
    templates.forEach((template) => {
      template.categories?.forEach((category) => categories.add(category));
    });
    return Array.from(categories).sort();
  }, [templates]);

  const fetchTemplates = async () => {
    // Templates are already loaded from context, no need to fetch
  };

  const filteredTemplates = useMemo(() => {
    let filtered = templates;

    // Filter by category if specified in URL
    if (category) {
      filtered = filtered.filter((template) =>
        template.categories?.some((templateCategory) => buildCategorySlug(templateCategory) === category),
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
    catalogError,
    retryCatalog,
    searchQuery,
    setSearchQuery,
    selectedCategories,
    setSelectedCategories,
    allCategories,
    fetchTemplates,
  };
};
