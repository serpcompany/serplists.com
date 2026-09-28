import { useId, useState, type DragEvent, type KeyboardEvent } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { ChevronDown, ChevronRight, FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ReorderHandle, ReorderHint } from "@/components/template-editor/ReorderHandle";
import {
  dropIndicatorClass,
  moveArrayEntry,
  remapIndexAfterMove,
  ROW_ACTIONS_REVEAL_CLASS,
} from "@/components/template-editor/reorder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  createTemplateEditorItem,
  createTemplateEditorSection,
  type TemplateEditorFormValues,
} from "@/lib/forms/templateEditorForm";
import { cn } from "@/lib/utils";
import { getSectionDisplayTitle } from "@/lib/utils/checklistSections";

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

interface SectionSidebarProps {
  outlineSelectionActive: boolean;
  selectedSectionIndex: number;
  selectedItemIndex: number | null;
  onSelectSection: (sectionIndex: number) => void;
  onSelectItem: (sectionIndex: number, itemIndex: number) => void;
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
  // Sections the user collapsed, by section id; every other section is expanded. The
  // outline can mount before the template loads (a reset then replaces every section),
  // and a Clipy draft or a save resets the form too, so expansion must not be seeded
  // from the sections present at mount. Keyed by id, a collapsed section stays
  // collapsed when it moves or the form is reset to the saved values.
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Where the last keyboard move put an entry, for screen readers.
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
    // A new section has a new id, so it starts expanded.
    sectionsFieldArray.append(createTemplateEditorSection());
    onSelectSection(nextIndex);
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

  // Drops and arrow keys both move through these, so the selection follows the move.
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

  function handleSectionDrop(event: DragEvent<HTMLElement>, toIndex: number): void {
    event.preventDefault();
    const drag = draggedOutlineItem;
    if (!drag || drag.kind !== "section" || drag.sectionIndex === toIndex) {
      finishDrag();
      return;
    }

    moveSection(drag.sectionIndex, toIndex);
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

    moveTask(sectionIndex, drag.itemIndex, toIndex);
    finishDrag();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ReorderHint announcement={moveAnnouncement} id={reorderHintId} />
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
            // A save stores this label for an untitled section, so the outline shows it.
            const sectionLabel = getSectionDisplayTitle(section ?? { title: "" }, sectionIndex);
            const sectionSelected =
              outlineSelectionActive &&
              selectedSectionIndex === sectionIndex &&
              selectedItemIndex === null;
            const isExpanded = !collapsedSectionIds.has(sectionField.id);
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
                  dropIndicatorClass(sectionDropEdge),
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
                  <ReorderHandle
                    count={sectionsFieldArray.fields.length}
                    handleId={`section:${sectionField.id}`}
                    hintId={reorderHintId}
                    index={sectionIndex}
                    label={sectionLabel}
                    onDragEnd={finishDrag}
                    onDragStart={(event) =>
                      startDrag(event, { kind: "section", sectionIndex })
                    }
                    onMove={moveSection}
                    onMoved={setMoveAnnouncement}
                  />

                  <button
                    aria-label={
                      isExpanded
                        ? `Collapse ${sectionLabel}`
                        : `Expand ${sectionLabel}`
                    }
                    onClick={() => toggleSection(sectionField.id)}
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
                          sectionLabel,
                        )
                      }
                      className="flex-1 truncate py-1.5 text-left text-sm text-sidebar-foreground"
                      type="button"
                    >
                      {sectionLabel}
                    </button>
                  )}

                  <div
                    className={cn(
                      "flex shrink-0 items-center gap-1",
                      sectionSelected ? "opacity-100" : ROW_ACTIONS_REVEAL_CLASS,
                    )}
                  >
                    <Button
                      aria-label={`Add task to ${sectionLabel}`}
                      variant="ghost"
                      size="icon"
                      onClick={() => handleAddTask(sectionIndex)}
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      type="button"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button
                      aria-label={`Remove ${sectionLabel}`}
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
                      const itemLabel = item.title || buildItemFallbackLabel(itemIndex);
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
                            dropIndicatorClass(taskDropEdge),
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
                          <ReorderHandle
                            count={section.items.length}
                            handleId={`task:${item.id}`}
                            hintId={reorderHintId}
                            index={itemIndex}
                            label={itemLabel}
                            onDragEnd={finishDrag}
                            onDragStart={(event) =>
                              startDrag(event, {
                                itemIndex,
                                kind: "task",
                                sectionIndex,
                              })
                            }
                            onMove={(fromIndex, toIndex) => moveTask(sectionIndex, fromIndex, toIndex)}
                            onMoved={setMoveAnnouncement}
                          />
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
                                handleStartEditingItem(sectionIndex, itemIndex, itemLabel)
                              }
                              className="flex-1 truncate text-left text-sm text-sidebar-foreground"
                              type="button"
                            >
                              {itemLabel}
                            </button>
                          )}

                          <Button
                            aria-label={`Remove ${itemLabel}`}
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveTask(sectionIndex, itemIndex)}
                            className={cn(
                              "h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive",
                              itemSelected ? "opacity-100" : ROW_ACTIONS_REVEAL_CLASS,
                            )}
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
