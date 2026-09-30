import { useState, type DragEvent } from "react";

// Drag and drop in the template editor's outline: sections move among sections, and tasks
// within their section. Only a drag that started on one of the outline's handles can drop
// here. Drops go through the same moves as the arrow keys and the Move buttons.

export type OutlineDragState =
  | { kind: "section"; sectionIndex: number }
  | { kind: "task"; itemIndex: number; sectionIndex: number };

export type OutlineDropTarget =
  | { edge: "after" | "before"; kind: "section"; sectionIndex: number }
  | {
      edge: "after" | "before";
      itemIndex: number;
      kind: "task";
      sectionIndex: number;
    };

const OUTLINE_DRAG_TYPE = "application/x-serplists-outline";

type OutlineMoves = {
  moveSection: (fromIndex: number, toIndex: number) => void;
  moveTask: (sectionIndex: number, fromIndex: number, toIndex: number) => void;
};

export function useOutlineDrag({ moveSection, moveTask }: OutlineMoves) {
  const [draggedOutlineItem, setDraggedOutlineItem] =
    useState<OutlineDragState | null>(null);
  const [outlineDropTarget, setOutlineDropTarget] =
    useState<OutlineDropTarget | null>(null);

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

  function handleSectionDragOver(event: DragEvent<HTMLElement>, sectionIndex: number): void {
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

  return {
    draggedOutlineItem,
    finishDrag,
    handleSectionDragOver,
    handleSectionDrop,
    handleTaskDragOver,
    handleTaskDrop,
    outlineDropTarget,
    startDrag,
  };
}
