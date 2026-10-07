import { useState, type DragEvent } from "react";

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
