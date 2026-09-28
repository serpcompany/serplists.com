import { useState, type DragEvent } from "react";

// Drag-and-drop reordering for one list of content blocks. Only a drag that started on
// one of this list's handles can drop here: a drag from the outline, another task's
// blocks, or selected text is left alone (no preventDefault, so the browser refuses it).
const BLOCK_DRAG_TYPE = "application/x-serplists-content-block";

export type BlockDropTarget = { edge: "after" | "before"; index: number };

export function useBlockDrag(move: (fromIndex: number, toIndex: number) => void) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<BlockDropTarget | null>(null);

  function finishDrag(): void {
    setDraggedIndex(null);
    setDropTarget(null);
  }

  function startDrag(event: DragEvent<HTMLElement>, index: number): void {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    // Firefox starts a drag only once it has data.
    event.dataTransfer.setData(BLOCK_DRAG_TYPE, String(index));
    setDraggedIndex(index);
  }

  function handleDragOver(event: DragEvent<HTMLElement>, index: number): void {
    if (draggedIndex === null || draggedIndex === index) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    const edge = draggedIndex > index ? "before" : "after";
    setDropTarget((current) =>
      current?.index === index && current.edge === edge ? current : { edge, index },
    );
  }

  function handleDrop(event: DragEvent<HTMLElement>, index: number): void {
    if (draggedIndex === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (draggedIndex !== index) move(draggedIndex, index);
    finishDrag();
  }

  return { draggedIndex, dropTarget, finishDrag, handleDragOver, handleDrop, startDrag };
}
