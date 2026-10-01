import type { JSX } from "react";
import { ChevronDown, ChevronRight, FileText, Plus, Trash2 } from "lucide-react";

import {
  ReorderHandle,
  ReorderHint,
  ReorderMoveButtons,
} from "@/components/template-editor/ReorderHandle";
import { dropIndicatorClass, ROW_ACTIONS_REVEAL_CLASS } from "@/components/template-editor/reorder";
import {
  useSectionOutline,
  type SectionOutlineSelection,
} from "@/components/template-editor/useSectionOutline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getSectionDisplayTitle } from "@/lib/utils/checklistSections";

interface SectionSidebarProps extends SectionOutlineSelection {
  outlineSelectionActive: boolean;
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
  const {
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
  } = useSectionOutline({
    selectedSectionIndex,
    selectedItemIndex,
    onSelectSection,
    onSelectItem,
    onEntryPicked,
  });

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
