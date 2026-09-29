import type { JSX } from "react";
import type { DragEvent, KeyboardEvent } from "react";
import { GripVertical } from "lucide-react";

import { handleKeyboardReorder, REORDER_KEYS_HINT } from "@/components/template-editor/reorder";

interface ReorderHandleProps {
  // What the handle moves, e.g. "Section 1"; the handle is named "Drag Section 1".
  label: string;
  index: number;
  count: number;
  // Finds the handle again after a move (see focusReorderHandle).
  handleId: string;
  // The id of the ReorderHint that says how to move it with the keyboard.
  hintId: string;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  // Receives the screen-reader announcement after a keyboard move.
  onMoved: (announcement: string) => void;
}

// A drag handle that also moves its entry one place with the Up and Down arrow keys.
export function ReorderHandle({
  label,
  index,
  count,
  handleId,
  hintId,
  onDragStart,
  onDragEnd,
  onMove,
  onMoved,
}: ReorderHandleProps): JSX.Element {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    const announcement = handleKeyboardReorder(event, { count, handleId, index, label }, onMove);
    if (announcement) onMoved(announcement);
  }

  return (
    <button
      aria-describedby={hintId}
      aria-label={`Drag ${label}`}
      className="flex h-7 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded opacity-40 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:opacity-100 active:cursor-grabbing"
      data-reorder-handle={handleId}
      draggable
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      onKeyDown={handleKeyDown}
      type="button"
    >
      <GripVertical className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

// The keyboard hint the handles point at, and a live region that says where a keyboard
// move put the entry. Both are read by screen readers only.
export function ReorderHint({ id, announcement }: { id: string; announcement: string }): JSX.Element {
  return (
    <>
      <p className="sr-only" id={id}>
        {REORDER_KEYS_HINT}
      </p>
      <div aria-live="polite" className="sr-only" role="status">
        {announcement}
      </div>
    </>
  );
}
