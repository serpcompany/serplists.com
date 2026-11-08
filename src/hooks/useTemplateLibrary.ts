import { useMemo } from "react";
import { useTemplateLists } from "@/contexts/TemplatesContext";
import { hasCanonicalPublicTemplatePath } from "@/lib/routes";
import { getPredefinedCategories } from "@/utils/categories";

export const useTemplateLibrary = (_category?: string, templateType?: "checklist" | "recipe") => {
  const {
    templates: contextTemplates,
    catalogPending,
    catalogError,
    refetchCatalog,
  } = useTemplateLists({ catalog: true, workspace: false });

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

  return {
    templates,
    loading,
    catalogError,
    retryCatalog,
    allCategories,
  };
};
