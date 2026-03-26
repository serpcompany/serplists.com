import { useState } from "react";

export const useTemplateEditorState = () => {
  const [selectedSectionIndex, setSelectedSectionIndex] = useState<number>(0);
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
  const [showingSEO, setShowingSEO] = useState(false);
  const [showingTemplateInfo, setShowingTemplateInfo] = useState(true);
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
