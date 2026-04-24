import { useState, type KeyboardEvent } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  createTemplateEditorItem,
  createTemplateEditorSection,
  type TemplateEditorFormValues,
} from "@/lib/forms/templateEditorForm";
import { cn } from "@/lib/utils";

type EditingItemState = {
  itemIndex: number;
  sectionIndex: number;
};

interface SectionSidebarProps {
  outlineSelectionActive: boolean;
  selectedSectionIndex: number;
  selectedItemIndex: number | null;
  onSelectSection: (sectionIndex: number) => void;
  onSelectItem: (sectionIndex: number, itemIndex: number) => void;
}

function buildSectionFallbackLabel(sectionIndex: number): string {
  return `Section ${sectionIndex + 1}`;
}

function buildItemFallbackLabel(itemIndex: number): string {
  return `Task ${itemIndex + 1}`;
}

export function SectionSidebar({
  outlineSelectionActive,
  selectedSectionIndex,
  selectedItemIndex,
  onSelectSection,
  onSelectItem,
}: SectionSidebarProps): JSX.Element {
  const { control, setValue } = useFormContext<TemplateEditorFormValues>();
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
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    new Set(sectionsFieldArray.fields.map((_, index) => index)),
  );

  function toggleSection(sectionIndex: number): void {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(sectionIndex)) {
        next.delete(sectionIndex);
      } else {
        next.add(sectionIndex);
      }
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
    setExpandedSections((current) => {
      const next = new Set(current);
      next.add(nextIndex);
      return next;
    });
    onSelectSection(nextIndex);
  }

  function handleRemoveSection(sectionIndex: number): void {
    if (sectionsFieldArray.fields.length <= 1) {
      toast.error("You must have at least one section");
      return;
    }

    sectionsFieldArray.remove(sectionIndex);
    setExpandedSections((current) => {
      const next = new Set<number>();
      for (const index of current) {
        if (index === sectionIndex) {
          continue;
        }

        next.add(index > sectionIndex ? index - 1 : index);
      }
      return next;
    });
    onSelectSection(Math.max(0, sectionIndex - 1));
  }

  function handleAddTask(sectionIndex: number): void {
    const currentItems = sections?.[sectionIndex]?.items ?? [];
    setValue(
      `sections.${sectionIndex}.items`,
      [...currentItems, createTemplateEditorItem()],
      { shouldDirty: true },
    );
    setExpandedSections((current) => new Set(current).add(sectionIndex));
    onSelectItem(sectionIndex, currentItems.length);
  }

  function handleRemoveTask(sectionIndex: number, itemIndex: number): void {
    const currentItems = sections?.[sectionIndex]?.items ?? [];
    setValue(
      `sections.${sectionIndex}.items`,
      currentItems.filter((_, index) => index !== itemIndex),
      { shouldDirty: true },
    );
    onSelectSection(sectionIndex);
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Sections
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleAddSection}
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          type="button"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1 overflow-x-hidden">
        <div className="overflow-hidden p-2">
          {sectionsFieldArray.fields.map((sectionField, sectionIndex) => {
            const section = sections?.[sectionIndex];
            const sectionSelected =
              outlineSelectionActive &&
              selectedSectionIndex === sectionIndex &&
              selectedItemIndex === null;
            const isExpanded = expandedSections.has(sectionIndex);

            return (
              <div className="mb-1" key={sectionField.fieldId}>
                <div
                  className={cn(
                    "group flex min-w-0 items-center gap-1 overflow-hidden rounded-md px-1 transition-colors",
                    sectionSelected
                      ? "bg-sidebar-accent"
                      : "hover:bg-sidebar-accent/50",
                  )}
                >
                  <button
                    type="button"
                    className="h-3.5 w-3.5 shrink-0 cursor-grab touch-none rounded opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:opacity-100"
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                  </button>

                  <button
                    onClick={() => toggleSection(sectionIndex)}
                    className="flex h-7 w-6 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                    type="button"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>

                  {editingSectionIndex === sectionIndex ? (
                    <Input
                      autoFocus
                      className="h-6 flex-1 border-0 bg-transparent px-1 py-0 text-sm focus-visible:ring-0"
                      onBlur={() => saveSection(sectionIndex)}
                      onChange={(event) => setEditingValue(event.target.value)}
                      onKeyDown={(event) =>
                        handleKeyDown(event, {
                          kind: "section",
                          sectionIndex,
                        })
                      }
                      value={editingValue}
                    />
                  ) : (
                    <button
                      onClick={() => onSelectSection(sectionIndex)}
                      onDoubleClick={() =>
                        handleStartEditingSection(
                          sectionIndex,
                          section?.title || buildSectionFallbackLabel(sectionIndex),
                        )
                      }
                      className="flex-1 truncate py-1.5 text-left text-sm text-sidebar-foreground"
                      type="button"
                    >
                      {section?.title || buildSectionFallbackLabel(sectionIndex)}
                    </button>
                  )}

                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleAddTask(sectionIndex)}
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      type="button"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveSection(sectionIndex)}
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      type="button"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {isExpanded ? (
                  <div className="ml-4 mt-0.5 border-l border-sidebar-border pl-2">
                    {section?.items.map((item, itemIndex) => {
                      const itemSelected =
                        outlineSelectionActive &&
                        selectedSectionIndex === sectionIndex &&
                        selectedItemIndex === itemIndex;
                      const editingCurrentItem =
                        editingItem?.sectionIndex === sectionIndex &&
                        editingItem?.itemIndex === itemIndex;

                      return (
                        <div
                          key={item.id || `${sectionField.fieldId}-${itemIndex}`}
                          className={cn(
                            "group flex min-w-0 items-center gap-2 rounded-md px-1 py-1.5 transition-colors",
                            itemSelected
                              ? "bg-sidebar-accent"
                              : "hover:bg-sidebar-accent/50",
                          )}
                        >
                          <button
                            type="button"
                            className="h-3.5 w-3.5 shrink-0 cursor-grab touch-none rounded opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:opacity-100"
                          >
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                          </button>
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

                          {editingCurrentItem ? (
                            <Input
                              autoFocus
                              className="h-6 flex-1 border-0 bg-transparent px-1 py-0 text-sm focus-visible:ring-0"
                              onBlur={() => saveItem(sectionIndex, itemIndex)}
                              onChange={(event) => setEditingValue(event.target.value)}
                              onKeyDown={(event) =>
                                handleKeyDown(event, {
                                  kind: "item",
                                  itemIndex,
                                  sectionIndex,
                                })
                              }
                              value={editingValue}
                            />
                          ) : (
                            <button
                              onClick={() => onSelectItem(sectionIndex, itemIndex)}
                              onDoubleClick={() =>
                                handleStartEditingItem(
                                  sectionIndex,
                                  itemIndex,
                                  item.title || buildItemFallbackLabel(itemIndex),
                                )
                              }
                              className="flex-1 truncate text-left text-sm text-sidebar-foreground"
                              type="button"
                            >
                              {item.title || buildItemFallbackLabel(itemIndex)}
                            </button>
                          )}

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveTask(sectionIndex, itemIndex)}
                            className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                            type="button"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAddTask(sectionIndex)}
                      className="mt-1 h-7 w-full justify-start gap-2 text-xs text-muted-foreground hover:text-foreground"
                      type="button"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add task
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
