import { useState, type DragEvent, type KeyboardEvent } from "react";
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

type OutlineDragState =
  | { kind: "section"; sectionIndex: number }
  | { kind: "task"; itemIndex: number; sectionIndex: number };

type OutlineDropTarget =
  | { edge: "after" | "before"; kind: "section"; sectionIndex: number }
  | {
      edge: "after" | "before";
      itemIndex: number;
      kind: "task";
      sectionIndex: number;
    };

const OUTLINE_DRAG_TYPE = "application/x-serplists-outline";

function remapIndexAfterMove(index: number, fromIndex: number, toIndex: number): number {
  if (index === fromIndex) return toIndex;
  if (fromIndex < toIndex && index > fromIndex && index <= toIndex) return index - 1;
  if (toIndex < fromIndex && index >= toIndex && index < fromIndex) return index + 1;
  return index;
}

function moveArrayEntry<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  if (movedItem === undefined) return items;
  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
}

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
  const [draggedOutlineItem, setDraggedOutlineItem] =
    useState<OutlineDragState | null>(null);
  const [outlineDropTarget, setOutlineDropTarget] =
    useState<OutlineDropTarget | null>(null);
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
    const currentItems = getValues(`sections.${sectionIndex}.items`) ?? [];
    setValue(
      `sections.${sectionIndex}.items`,
      [...currentItems, createTemplateEditorItem()],
      { shouldDirty: true, shouldTouch: true, shouldValidate: true },
    );
    setExpandedSections((current) => new Set(current).add(sectionIndex));
    onSelectItem(sectionIndex, currentItems.length);
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

  function startDrag(event: DragEvent<HTMLButtonElement>, drag: OutlineDragState): void {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(OUTLINE_DRAG_TYPE, JSON.stringify(drag));
    setDraggedOutlineItem(drag);
  }

  function allowDrop(event: DragEvent<HTMLElement>): void {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function finishDrag(): void {
    setDraggedOutlineItem(null);
    setOutlineDropTarget(null);
  }

  function handleSectionDragOver(
    event: DragEvent<HTMLElement>,
    sectionIndex: number,
  ): void {
    const drag = draggedOutlineItem;
    if (!drag || drag.kind !== "section" || drag.sectionIndex === sectionIndex) {
      return;
    }

    allowDrop(event);
    const edge = drag.sectionIndex > sectionIndex ? "before" : "after";
    setOutlineDropTarget((current) =>
      current?.kind === "section" &&
      current.sectionIndex === sectionIndex &&
      current.edge === edge
        ? current
        : { edge, kind: "section", sectionIndex },
    );
  }

  function handleTaskDragOver(
    event: DragEvent<HTMLElement>,
    sectionIndex: number,
    itemIndex: number,
  ): void {
    event.stopPropagation();
    const drag = draggedOutlineItem;
    if (
      !drag ||
      drag.kind !== "task" ||
      drag.sectionIndex !== sectionIndex ||
      drag.itemIndex === itemIndex
    ) {
      return;
    }

    allowDrop(event);
    const edge = drag.itemIndex > itemIndex ? "before" : "after";
    setOutlineDropTarget((current) =>
      current?.kind === "task" &&
      current.sectionIndex === sectionIndex &&
      current.itemIndex === itemIndex &&
      current.edge === edge
        ? current
        : { edge, itemIndex, kind: "task", sectionIndex },
    );
  }

  function handleSectionDrop(event: DragEvent<HTMLElement>, toIndex: number): void {
    event.preventDefault();
    const drag = draggedOutlineItem;
    if (!drag || drag.kind !== "section" || drag.sectionIndex === toIndex) {
      finishDrag();
      return;
    }

    const fromIndex = drag.sectionIndex;
    sectionsFieldArray.move(fromIndex, toIndex);
    setExpandedSections((current) =>
      new Set(
        [...current].map((index) => remapIndexAfterMove(index, fromIndex, toIndex)),
      ),
    );

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
    finishDrag();
  }

  function handleTaskDrop(
    event: DragEvent<HTMLElement>,
    sectionIndex: number,
    toIndex: number,
  ): void {
    event.preventDefault();
    event.stopPropagation();
    const drag = draggedOutlineItem;
    if (
      !drag ||
      drag.kind !== "task" ||
      drag.sectionIndex !== sectionIndex ||
      drag.itemIndex === toIndex
    ) {
      finishDrag();
      return;
    }

    const currentItems = getValues(`sections.${sectionIndex}.items`) ?? [];
    setValue(
      `sections.${sectionIndex}.items`,
      moveArrayEntry(currentItems, drag.itemIndex, toIndex),
      { shouldDirty: true, shouldTouch: true, shouldValidate: true },
    );

    if (selectedSectionIndex === sectionIndex && selectedItemIndex !== null) {
      onSelectItem(
        sectionIndex,
        remapIndexAfterMove(selectedItemIndex, drag.itemIndex, toIndex),
      );
    }
    finishDrag();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Sections
        </span>
        <Button
          aria-label="Add section"
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
            const sectionDropEdge =
              outlineDropTarget?.kind === "section" &&
              outlineDropTarget.sectionIndex === sectionIndex
                ? outlineDropTarget.edge
                : null;

            return (
              <div
                className={cn(
                  "relative mb-1 rounded-md",
                  draggedOutlineItem?.kind === "section" &&
                    draggedOutlineItem.sectionIndex === sectionIndex &&
                    "opacity-50",
                  sectionDropEdge === "before" &&
                    "before:absolute before:inset-x-1 before:-top-0.5 before:z-20 before:h-0.5 before:rounded-full before:bg-primary before:content-['']",
                  sectionDropEdge === "after" &&
                    "after:absolute after:inset-x-1 after:-bottom-0.5 after:z-20 after:h-0.5 after:rounded-full after:bg-primary after:content-['']",
                )}
                data-drop-indicator={
                  sectionDropEdge ? `section-${sectionDropEdge}` : undefined
                }
                key={sectionField.fieldId}
                onDragOver={(event) => handleSectionDragOver(event, sectionIndex)}
                onDrop={(event) => handleSectionDrop(event, sectionIndex)}
              >
                <div
                  className={cn(
                    "group flex min-w-0 items-center gap-1 overflow-hidden rounded-md px-1 transition-colors",
                    sectionSelected
                      ? "bg-sidebar-accent"
                      : "hover:bg-sidebar-accent/50",
                  )}
                >
                  <button
                    aria-label={`Drag ${section?.title || buildSectionFallbackLabel(sectionIndex)}`}
                    draggable
                    onDragEnd={finishDrag}
                    onDragStart={(event) =>
                      startDrag(event, { kind: "section", sectionIndex })
                    }
                    type="button"
                    className="flex h-7 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:opacity-100 active:cursor-grabbing"
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                  </button>

                  <button
                    aria-label={
                      isExpanded
                        ? `Collapse ${section?.title || buildSectionFallbackLabel(sectionIndex)}`
                        : `Expand ${section?.title || buildSectionFallbackLabel(sectionIndex)}`
                    }
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
                      aria-label={`Add task to ${section?.title || buildSectionFallbackLabel(sectionIndex)}`}
                      variant="ghost"
                      size="icon"
                      onClick={() => handleAddTask(sectionIndex)}
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      type="button"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button
                      aria-label={`Remove ${section?.title || buildSectionFallbackLabel(sectionIndex)}`}
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
                      const taskDropEdge =
                        outlineDropTarget?.kind === "task" &&
                        outlineDropTarget.sectionIndex === sectionIndex &&
                        outlineDropTarget.itemIndex === itemIndex
                          ? outlineDropTarget.edge
                          : null;

                      return (
                        <div
                          key={item.id || `${sectionField.fieldId}-${itemIndex}`}
                          className={cn(
                            "group relative flex min-w-0 items-center gap-2 rounded-md px-1 py-1.5 transition-colors",
                            itemSelected
                              ? "bg-sidebar-accent"
                              : "hover:bg-sidebar-accent/50",
                            taskDropEdge && "bg-primary/10",
                            taskDropEdge === "before" &&
                              "before:absolute before:inset-x-1 before:-top-0.5 before:z-20 before:h-0.5 before:rounded-full before:bg-primary before:content-['']",
                            taskDropEdge === "after" &&
                              "after:absolute after:inset-x-1 after:-bottom-0.5 after:z-20 after:h-0.5 after:rounded-full after:bg-primary after:content-['']",
                          )}
                          data-drop-indicator={
                            taskDropEdge ? `task-${taskDropEdge}` : undefined
                          }
                          onDragOver={(event) =>
                            handleTaskDragOver(event, sectionIndex, itemIndex)
                          }
                          onDrop={(event) =>
                            handleTaskDrop(event, sectionIndex, itemIndex)
                          }
                        >
                          <button
                            aria-label={`Drag ${item.title || buildItemFallbackLabel(itemIndex)}`}
                            draggable
                            onDragEnd={finishDrag}
                            onDragStart={(event) =>
                              startDrag(event, {
                                itemIndex,
                                kind: "task",
                                sectionIndex,
                              })
                            }
                            type="button"
                            className="flex h-7 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:opacity-100 active:cursor-grabbing"
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
                            aria-label={`Remove ${item.title || buildItemFallbackLabel(itemIndex)}`}
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
