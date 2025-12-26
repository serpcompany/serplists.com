import { useState } from "react";
import { ChecklistSection, ChecklistItem, ChecklistItemContent, ChecklistSubItem } from "@/types/checklist";
import { toast } from "sonner";

export const useTemplateEditor = (initialSections: ChecklistSection[] = []) => {
  const [sections, setSections] = useState<ChecklistSection[]>(initialSections);

  const addSection = () => {
    setSections([
      ...sections,
      {
        id: `section_${Date.now()}`,
        title: "",
        items: [],
      },
    ]);
  };

  const updateSection = (index: number, field: string, value: string) => {
    const updatedSections = [...sections];
    updatedSections[index] = { ...updatedSections[index], [field]: value };
    setSections(updatedSections);
  };

  const removeSection = (index: number) => {
    if (sections.length === 1) {
      toast.error("You must have at least one section");
      return;
    }
    
    const updatedSections = [...sections];
    updatedSections.splice(index, 1);
    setSections(updatedSections);
  };

  const addItem = (sectionIndex: number) => {
    const updatedSections = [...sections];
    updatedSections[sectionIndex].items.push({
      id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: "",
      contents: []
    });
    setSections(updatedSections);
  };

  const updateItem = (sectionIndex: number, itemIndex: number, field: string, value: string) => {
    const updatedSections = [...sections];
    updatedSections[sectionIndex].items[itemIndex] = {
      ...updatedSections[sectionIndex].items[itemIndex],
      [field]: value,
    };
    setSections(updatedSections);
  };

  const removeItem = (sectionIndex: number, itemIndex: number) => {
    const updatedSections = [...sections];
    updatedSections[sectionIndex].items.splice(itemIndex, 1);
    setSections(updatedSections);
  };

  const addItemContent = (sectionIndex: number, itemIndex: number, contentType: "text" | "image" | "video" | "file" | "embed" | "subItems" | "page") => {
    const updatedSections = [...sections];
    const item = updatedSections[sectionIndex].items[itemIndex];
    
    if (!item.contents) {
      item.contents = [];
    }
    
    const newContent: ChecklistItemContent = {
      id: `content_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: contentType,
      value: ""
    } as ChecklistItemContent;
    
    if (contentType === "subItems") {
      newContent.subItems = [{ 
        id: `subitem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: ""
      }];
    } else if (contentType === "page") {
      (newContent as unknown).pageId = "";
    }
    
    item.contents.push(newContent);
    setSections(updatedSections);
  };

  const updateItemContent = (
    sectionIndex: number, 
    itemIndex: number, 
    contentIndex: number, 
    value: string
  ) => {
    const updatedSections = [...sections];
    const item = updatedSections[sectionIndex].items[itemIndex];
    
    if (item.contents && item.contents[contentIndex]) {
      item.contents[contentIndex].value = value;
    }
    
    setSections(updatedSections);
  };

  const updateItemContentMeta = (
    sectionIndex: number, 
    itemIndex: number, 
    contentIndex: number, 
    updates: Partial<ChecklistItemContent>
  ) => {
    const updatedSections = [...sections];
    const item = updatedSections[sectionIndex].items[itemIndex];
    
    if (item.contents && item.contents[contentIndex]) {
      Object.assign(item.contents[contentIndex], updates);
    }
    
    setSections(updatedSections);
  };

  const removeItemContent = (sectionIndex: number, itemIndex: number, contentIndex: number) => {
    const updatedSections = [...sections];
    const item = updatedSections[sectionIndex].items[itemIndex];
    
    if (item.contents) {
      item.contents.splice(contentIndex, 1);
    }
    
    setSections(updatedSections);
  };

  const addSubItem = (sectionIndex: number, itemIndex: number, contentIndex: number) => {
    const updatedSections = [...sections];
    const item = updatedSections[sectionIndex].items[itemIndex];
    
    if (item.contents && item.contents[contentIndex] && item.contents[contentIndex].type === "subItems") {
      if (!item.contents[contentIndex].subItems) {
        item.contents[contentIndex].subItems = [];
      }
      
      item.contents[contentIndex].subItems!.push({
        id: `subitem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: ""
      });
    }
    
    setSections(updatedSections);
  };

  const updateSubItem = (
    sectionIndex: number, 
    itemIndex: number, 
    contentIndex: number, 
    subItemIndex: number, 
    title: string
  ) => {
    const updatedSections = [...sections];
    const item = updatedSections[sectionIndex].items[itemIndex];
    
    if (
      item.contents && 
      item.contents[contentIndex] && 
      item.contents[contentIndex].subItems && 
      item.contents[contentIndex].subItems![subItemIndex]
    ) {
      item.contents[contentIndex].subItems![subItemIndex].title = title;
    }
    
    setSections(updatedSections);
  };

  const removeSubItem = (
    sectionIndex: number, 
    itemIndex: number, 
    contentIndex: number, 
    subItemIndex: number
  ) => {
    const updatedSections = [...sections];
    const item = updatedSections[sectionIndex].items[itemIndex];
    
    if (
      item.contents && 
      item.contents[contentIndex] && 
      item.contents[contentIndex].subItems
    ) {
      item.contents[contentIndex].subItems!.splice(subItemIndex, 1);
    }
    
    setSections(updatedSections);
  };

  return {
    sections,
    setSections,
    addSection,
    updateSection,
    removeSection,
    addItem,
    updateItem,
    removeItem,
    addItemContent,
    updateItemContent,
    updateItemContentMeta,
    removeItemContent,
    addSubItem,
    updateSubItem,
    removeSubItem
  };
};