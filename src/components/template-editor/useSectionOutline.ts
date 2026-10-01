import { useId, useState, type KeyboardEvent } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { moveArrayEntry, remapIndexAfterMove } from "@/components/template-editor/reorder";
import { useOutlineDrag } from "@/components/template-editor/useOutlineDrag";
import {
  createTemplateEditorItem,
  createTemplateEditorSection,
  type TemplateEditorFormValues,
} from "@/lib/forms/templateEditorForm";

type EditingItemState = {
  itemIndex: number;
  sectionIndex: number;
};

export type SectionOutlineSelection = {
  selectedSectionIndex: number;
  selectedItemIndex: number | null;
  onSelectSection: (sectionIndex: number) => void;
  onSelectItem: (sectionIndex: number, itemIndex: number) => void;
  onEntryPicked?: () => void;
};

export function useSectionOutline({
  selectedSectionIndex,
  selectedItemIndex,
  onSelectSection,
  onSelectItem,
  onEntryPicked,
}: SectionOutlineSelection) {
  const { control, getValues, setValue } =
    useFormContext<TemplateEditorFormValues>();
  const sectionsFieldArray = useFieldArray({
    control,
    keyName: "fieldId",
    name: "sections",
  });
  const sections = useWatch({
    control,
    name: "sections",
  });
  const [editingSectionIndex, setEditingSectionIndex] = useState<number | null>(
    null,
  );
  const [editingItem, setEditingItem] = useState<EditingItemState | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const outlineDrag = useOutlineDrag({ moveSection, moveTask });
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [moveAnnouncement, setMoveAnnouncement] = useState("");
  const reorderHintId = useId();

  function toggleSection(sectionId: string): void {
    setCollapsedSectionIds((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }

  function expandSection(sectionId: string | undefined): void {
    if (!sectionId) {
      return;
    }

    setCollapsedSectionIds((current) => {
      if (!current.has(sectionId)) {
        return current;
      }

      const next = new Set(current);
      next.delete(sectionId);
      return next;
    });
  }

  function stopEditing(): void {
    setEditingSectionIndex(null);
    setEditingItem(null);
    setEditingValue("");
  }

  function handleAddSection(): void {
    const nextIndex = sectionsFieldArray.fields.length;
    sectionsFieldArray.append(createTemplateEditorSection());
    onSelectSection(nextIndex);
    onEntryPicked?.();
  }

  function handleRemoveSection(sectionIndex: number): void {
    if (sectionsFieldArray.fields.length <= 1) {
      toast.error("You must have at least one section");
      return;
    }

    sectionsFieldArray.remove(sectionIndex);
    onSelectSection(Math.max(0, sectionIndex - 1));
  }

  function handleAddTask(sectionIndex: number): void {
    const currentItems = getValues(`sections.${sectionIndex}.items`) ?? [];
    setValue(
      `sections.${sectionIndex}.items`,
      [...currentItems, createTemplateEditorItem()],
      { shouldDirty: true, shouldTouch: true, shouldValidate: true },
    );
    expandSection(getValues(`sections.${sectionIndex}.id`));
    onSelectItem(sectionIndex, currentItems.length);
    onEntryPicked?.();
  }

  function handleRemoveTask(sectionIndex: number, itemIndex: number): void {
    const currentItems = getValues(`sections.${sectionIndex}.items`) ?? [];
    setValue(
      `sections.${sectionIndex}.items`,
      currentItems.filter((_, index) => index !== itemIndex),
      { shouldDirty: true, shouldTouch: true, shouldValidate: true },
    );
    onSelectSection(sectionIndex);
  }

  function handlePickSection(sectionIndex: number): void {
    onSelectSection(sectionIndex);
    onEntryPicked?.();
  }

  function handlePickItem(sectionIndex: number, itemIndex: number): void {
    onSelectItem(sectionIndex, itemIndex);
    onEntryPicked?.();
  }

  function handleStartEditingSection(
    sectionIndex: number,
    currentTitle: string,
  ): void {
    setEditingItem(null);
    setEditingSectionIndex(sectionIndex);
    setEditingValue(currentTitle);
  }

  function handleStartEditingItem(
    sectionIndex: number,
    itemIndex: number,
    currentTitle: string,
  ): void {
    setEditingSectionIndex(null);
    setEditingItem({ sectionIndex, itemIndex });
    setEditingValue(currentTitle);
  }

  function saveSection(sectionIndex: number): void {
    setValue(`sections.${sectionIndex}.title`, editingValue, {
      shouldDirty: true,
    });
    stopEditing();
  }

  function saveItem(sectionIndex: number, itemIndex: number): void {
    setValue(`sections.${sectionIndex}.items.${itemIndex}.title`, editingValue, {
      shouldDirty: true,
    });
    stopEditing();
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    params:
      | { kind: "section"; sectionIndex: number }
      | { kind: "item"; itemIndex: number; sectionIndex: number },
  ): void {
    if (event.key === "Enter") {
      if (params.kind === "section") {
        saveSection(params.sectionIndex);
      } else {
        saveItem(params.sectionIndex, params.itemIndex);
      }
      return;
    }

    if (event.key === "Escape") {
      stopEditing();
    }
  }

  function moveSection(fromIndex: number, toIndex: number): void {
    sectionsFieldArray.move(fromIndex, toIndex);

    const nextSelectedSection = remapIndexAfterMove(
      selectedSectionIndex,
      fromIndex,
      toIndex,
    );
    if (selectedItemIndex === null) {
      onSelectSection(nextSelectedSection);
    } else {
      onSelectItem(nextSelectedSection, selectedItemIndex);
    }
  }

  function moveTask(sectionIndex: number, fromIndex: number, toIndex: number): void {
    const currentItems = getValues(`sections.${sectionIndex}.items`) ?? [];
    setValue(
      `sections.${sectionIndex}.items`,
      moveArrayEntry(currentItems, fromIndex, toIndex),
      { shouldDirty: true, shouldTouch: true, shouldValidate: true },
    );

    if (selectedSectionIndex === sectionIndex && selectedItemIndex !== null) {
      onSelectItem(
        sectionIndex,
        remapIndexAfterMove(selectedItemIndex, fromIndex, toIndex),
      );
    }
  }

  return {
    collapsedSectionIds,
    editingItem,
    editingSectionIndex,
    editingValue,
    handleAddSection,
    handleAddTask,
    handleKeyDown,
    handlePickItem,
    handlePickSection,
    handleRemoveSection,
    handleRemoveTask,
    handleStartEditingItem,
    handleStartEditingSection,
    moveAnnouncement,
    moveSection,
    moveTask,
    outlineDrag,
    reorderHintId,
    saveItem,
    saveSection,
    sections,
    sectionsFieldArray,
    setEditingValue,
    setMoveAnnouncement,
    toggleSection,
  };
}
