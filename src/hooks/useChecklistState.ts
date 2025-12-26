import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTemplates, ChecklistTemplate } from '@/contexts/TemplatesContext';
import { generateChecklistSEO, applySEOMetadata } from '@/utils/seoTemplates';

export const useChecklistState = () => {
  const { slug } = useParams<{ slug: string }>();
  const { getTemplateBySlug } = useTemplates();
  const [template, setTemplate] = useState<ChecklistTemplate | undefined>();
  const [loading, setLoading] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  useEffect(() => {
    if (slug) {
      const foundTemplate = getTemplateBySlug(slug);
      setTemplate(foundTemplate);
      
      // Update SEO metadata
      if (foundTemplate) {
        const seoData = generateChecklistSEO(foundTemplate);
        applySEOMetadata(seoData);
      }
      
      // Auto-select the first item when template loads
      if (foundTemplate && !selectedItemId) {
        if (foundTemplate.sections[0]?.items[0]) {
          setSelectedItemId(foundTemplate.sections[0].items[0].id);
        }
      }
    }
    setLoading(false);
  }, [slug, getTemplateBySlug, selectedItemId]);

  const getSelectedItem = () => {
    if (!template || !selectedItemId) return null;
    for (const section of template.sections) {
      for (const item of section.items) {
        if (item.id === selectedItemId) {
          return { item, section };
        }
      }
    }
    return null;
  };

  return {
    template,
    loading,
    selectedItemId,
    setSelectedItemId,
    getSelectedItem
  };
};