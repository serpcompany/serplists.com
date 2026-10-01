import { useState, useMemo } from "react";
import { useTemplateLists } from "@/contexts/TemplatesContext";
import { buildCategorySlug, hasCanonicalPublicTemplatePath } from "@/lib/routes";
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

  const templates = useMemo(() => {
    const publicTemplates = contextTemplates.filter(
      (t) => t.isPublic === true && hasCanonicalPublicTemplatePath(t),
    );
    if (!templateType) return publicTemplates;
    return publicTemplates.filter(t => t.type === templateType);
  }, [contextTemplates, templateType]);

  const loading = catalogPending;
  const retryCatalog = () => {
    void refetchCatalog();
  };

  const allCategories = useMemo(() => {
    const categories = new Set<string>(getPredefinedCategories());
    templates.forEach((template) => {
      template.categories?.forEach((category) => categories.add(category));
    });
    return Array.from(categories).sort();
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    let filtered = templates;

    if (category) {
      filtered = filtered.filter((template) =>
        template.categories?.some((templateCategory) => buildCategorySlug(templateCategory) === category),
      );
    }

    if (selectedCategories.length > 0) {
      filtered = filtered.filter(template => 
        selectedCategories.some(selectedCat => 
          template.categories?.includes(selectedCat)
        )
      );
    }

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
  };
};
