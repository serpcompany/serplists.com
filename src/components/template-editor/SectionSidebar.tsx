import type { JSX } from "react";
import { useId, useState, type KeyboardEvent } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { ChevronDown, ChevronRight, FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  ReorderHandle,
  ReorderHint,
  ReorderMoveButtons,
} from "@/components/template-editor/ReorderHandle";
import {
  dropIndicatorClass,
  moveArrayEntry,
  remapIndexAfterMove,
  ROW_ACTIONS_REVEAL_CLASS,
} from "@/components/template-editor/reorder";
import { useOutlineDrag } from "@/components/template-editor/useOutlineDrag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface SectionSidebarProps {
  outlineSelectionActive: boolean;
  selectedSectionIndex: number;
  selectedItemIndex: number | null;
  onSelectSection: (sectionIndex: number) => void;
  onSelectItem: (sectionIndex: number, itemIndex: number) => void;
  // Called after the user picks or adds a section or task (not after a move or a removal),
  // so the phone's outline sheet can close on the chosen entry.
  onEntryPicked?: () => void;
}

function buildItemFallbackLabel(itemIndex: number): string {
  return `Task ${itemIndex + 1}`;
}

// Move up and Move down show on touch screens, where dragging does not work; a mouse drags the
// handle, and the keyboard moves it with the arrow keys.
const MOVE_BUTTON_CLASS = "pointer-fine:hidden";

// The template editor's outline: its sections, each collapsible with its tasks. A row selects
// its entry; its handle drags it or moves it with the arrow keys, and its actions add a task,
// remove it, or move it by touch. Double-clicking a title renames it in place.
export function SectionSidebar({
  outlineSelectionActive,
  selectedSectionIndex,
  selectedItemIndex,
  onSelectSection,
  onSelectItem,
  onEntryPicked,
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
  const outlineDrag = useOutlineDrag({ moveSection, moveTask });
  // Sections the user collapsed, by section id; every other section is expanded. The
  // outline can mount before the template loads (a reset then replaces every section),
  // and a Clipy draft or a save resets the form too, so expansion must not be seeded
  // from the sections present at mount. Keyed by id, a collapsed section stays
  // collapsed when it moves or the form is reset to the saved values.
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Where the last keyboard or button move put an entry, for screen readers.
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

  // Drops, arrow keys and the Move buttons all move through these, so the selection follows
  // the move.
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

  const { draggedOutlineItem, outlineDropTarget } = outlineDrag;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ReorderHint announcement={moveAnnouncement} id={reorderHintId} />
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">Sections</span>
        <Button
          aria-label="Add section"
          variant="ghost"
          size="icon-sm"
          onClick={handleAddSection}
          className="text-muted-foreground"
          type="button"
        >
          <Plus />
        </Button>
      </div>

      <div className="flex flex-col gap-1 p-2">
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
                "relative rounded-md",
                draggedOutlineItem?.kind === "section" &&
                  draggedOutlineItem.sectionIndex === sectionIndex &&
                  "opacity-50",
                dropIndicatorClass(sectionDropEdge),
              )}
              data-drop-indicator={
                sectionDropEdge ? `section-${sectionDropEdge}` : undefined
              }
              key={sectionField.fieldId}
              onDragOver={(event) => outlineDrag.handleSectionDragOver(event, sectionIndex)}
              onDrop={(event) => outlineDrag.handleSectionDrop(event, sectionIndex)}
            >
              <div
                className={cn(
                  "group flex min-h-9 min-w-0 items-center gap-1 rounded-md px-1 transition-colors",
                  sectionSelected ? "bg-muted" : "hover:bg-muted/50",
                )}
              >
                <ReorderHandle
                  count={sectionsFieldArray.fields.length}
                  handleId={`section:${sectionField.id}`}
                  hintId={reorderHintId}
                  index={sectionIndex}
                  label={sectionLabel}
                  onDragEnd={outlineDrag.finishDrag}
                  onDragStart={(event) =>
                    outlineDrag.startDrag(event, { kind: "section", sectionIndex })
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
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                  type="button"
                >
                  {isExpanded ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                </button>

                {editingSectionIndex === sectionIndex ? (
                  <Input
                    autoFocus
                    className="h-7 flex-1 px-1.5"
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
                    onClick={() => handlePickSection(sectionIndex)}
                    onDoubleClick={() =>
                      handleStartEditingSection(
                        sectionIndex,
                        sectionLabel,
                      )
                    }
                    className="min-w-0 flex-1 truncate rounded-sm py-1.5 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    type="button"
                  >
                    {sectionLabel}
                  </button>
                )}

                <div
                  className={cn(
                    "flex shrink-0 items-center",
                    sectionSelected ? "opacity-100" : ROW_ACTIONS_REVEAL_CLASS,
                  )}
                >
                  <Button
                    aria-label={`Add task to ${sectionLabel}`}
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleAddTask(sectionIndex)}
                    className="text-muted-foreground"
                    type="button"
                  >
                    <Plus />
                  </Button>
                  <Button
                    aria-label={`Remove ${sectionLabel}`}
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleRemoveSection(sectionIndex)}
                    className="text-muted-foreground hover:text-destructive"
                    type="button"
                  >
                    <Trash2 />
                  </Button>
                  <ReorderMoveButtons
                    buttonClassName={MOVE_BUTTON_CLASS}
                    count={sectionsFieldArray.fields.length}
                    handleId={`section:${sectionField.id}`}
                    index={sectionIndex}
                    label={sectionLabel}
                    onMove={moveSection}
                    onMoved={setMoveAnnouncement}
                  />
                </div>
              </div>

              {isExpanded ? (
                <div className="mt-0.5 ml-4 flex flex-col gap-0.5 border-l pl-2">
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
                          "group relative flex min-h-9 min-w-0 items-center gap-1 rounded-md px-1 transition-colors",
                          itemSelected ? "bg-muted" : "hover:bg-muted/50",
                          taskDropEdge && "bg-muted",
                          dropIndicatorClass(taskDropEdge),
                        )}
                        data-drop-indicator={
                          taskDropEdge ? `task-${taskDropEdge}` : undefined
                        }
                        onDragOver={(event) =>
                          outlineDrag.handleTaskDragOver(event, sectionIndex, itemIndex)
                        }
                        onDrop={(event) =>
                          outlineDrag.handleTaskDrop(event, sectionIndex, itemIndex)
                        }
                      >
                        <ReorderHandle
                          count={section.items.length}
                          handleId={`task:${item.id}`}
                          hintId={reorderHintId}
                          index={itemIndex}
                          label={itemLabel}
                          onDragEnd={outlineDrag.finishDrag}
                          onDragStart={(event) =>
                            outlineDrag.startDrag(event, {
                              itemIndex,
                              kind: "task",
                              sectionIndex,
                            })
                          }
                          onMove={(fromIndex, toIndex) => moveTask(sectionIndex, fromIndex, toIndex)}
                          onMoved={setMoveAnnouncement}
                        />
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />

                        {editingCurrentItem ? (
                          <Input
                            autoFocus
                            className="h-7 flex-1 px-1.5"
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
                            onClick={() => handlePickItem(sectionIndex, itemIndex)}
                            onDoubleClick={() =>
                              handleStartEditingItem(sectionIndex, itemIndex, itemLabel)
                            }
                            className="min-w-0 flex-1 truncate rounded-sm py-1.5 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                            type="button"
                          >
                            {itemLabel}
                          </button>
                        )}

                        <Button
                          aria-label={`Remove ${itemLabel}`}
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleRemoveTask(sectionIndex, itemIndex)}
                          className={cn(
                            "shrink-0 text-muted-foreground hover:text-destructive",
                            itemSelected ? "opacity-100" : ROW_ACTIONS_REVEAL_CLASS,
                          )}
                          type="button"
                        >
                          <Trash2 />
                        </Button>
                        <ReorderMoveButtons
                          buttonClassName={cn(
                            MOVE_BUTTON_CLASS,
                            itemSelected ? "opacity-100" : ROW_ACTIONS_REVEAL_CLASS,
                          )}
                          count={section.items.length}
                          handleId={`task:${item.id}`}
                          index={itemIndex}
                          label={itemLabel}
                          onMove={(fromIndex, toIndex) => moveTask(sectionIndex, fromIndex, toIndex)}
                          onMoved={setMoveAnnouncement}
                        />
                      </div>
                    );
                  })}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAddTask(sectionIndex)}
                    className="justify-start text-muted-foreground"
                    type="button"
                  >
                    <Plus data-icon="inline-start" />
                    Add task
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
