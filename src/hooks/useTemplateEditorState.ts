import { useState } from "react";
import { ChecklistTemplate } from "@/types/checklist";

export const useTemplateEditorState = (initialTemplate?: ChecklistTemplate) => {
  const [title, setTitle] = useState(initialTemplate?.title || "");
  const [description, setDescription] = useState(initialTemplate?.description || "");
  const [templateType, setTemplateType] = useState<"checklist" | "recipe">(
    initialTemplate?.type || "checklist"
  );
  const [seoTitle, setSeoTitle] = useState(initialTemplate?.seoTitle || "");
  const [seoDescription, setSeoDescription] = useState(initialTemplate?.seoDescription || "");
  const [seoUrl, setSeoUrl] = useState(initialTemplate?.seoUrl || "");
  const [categories, setCategories] = useState<string[]>(initialTemplate?.categories || []);
  const [tags, setTags] = useState<string[]>(initialTemplate?.tags || []);
  const [selectedSectionIndex, setSelectedSectionIndex] = useState<number>(0);
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
  const [showingSEO, setShowingSEO] = useState(false);
  const [showingTemplateInfo, setShowingTemplateInfo] = useState(!initialTemplate); // Show template info by default for new templates
  const [errors, setErrors] = useState<{ type: string; message: string }[]>([]);

  const handleSelectSection = (sectionIndex: number) => {
    setSelectedSectionIndex(sectionIndex);
    setSelectedItemIndex(null);
    setShowingSEO(false);
    setShowingTemplateInfo(false);
  };

  const handleSelectItem = (sectionIndex: number, itemIndex: number) => {
    setSelectedSectionIndex(sectionIndex);
    setSelectedItemIndex(itemIndex);
    setShowingSEO(false);
    setShowingTemplateInfo(false);
  };

  const handleSelectSEO = () => {
    setShowingSEO(true);
    setShowingTemplateInfo(false);
    setSelectedItemIndex(null);
  };

  const handleSelectTemplateInfo = () => {
    setShowingTemplateInfo(true);
    setShowingSEO(false);
    setSelectedItemIndex(null);
  };

  return {
    title,
    setTitle,
    description,
    setDescription,
    templateType,
    setTemplateType,
    seoTitle,
    setSeoTitle,
    seoDescription,
    setSeoDescription,
    seoUrl,
    setSeoUrl,
    categories,
    setCategories,
    tags,
    setTags,
    selectedSectionIndex,
    selectedItemIndex,
    showingSEO,
    showingTemplateInfo,
    errors,
    setErrors,
    handleSelectSection,
    handleSelectItem,
    handleSelectSEO,
    handleSelectTemplateInfo
  };
};
