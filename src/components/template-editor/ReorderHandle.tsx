import type { JSX } from "react";
import type { DragEvent, KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  handleKeyboardReorder,
  moveWithButton,
  REORDER_KEYS_HINT,
  type ReorderDirection,
} from "@/components/template-editor/reorder";
import { cn } from "@/lib/utils";

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

// A drag handle that also moves its entry one place with the Up and Down arrow keys. HTML5
// drag and drop needs a mouse, so a touch screen (a coarse pointer) shows the entry's Move up
// and Move down buttons (ReorderMoveButtons) instead of the handle.
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
      className="flex h-7 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing pointer-coarse:hidden"
      data-reorder-handle={handleId}
      draggable
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      onKeyDown={handleKeyDown}
      type="button"
    >
      <GripVertical className="size-4" />
    </button>
  );
}

interface ReorderMoveButtonsProps {
  // Classes for each button, such as the row actions' reveal.
  buttonClassName?: string;
  count: number;
  // The entry's handle id (see ReorderHandle), which finds the moved entry's buttons again.
  handleId: string;
  index: number;
  // What the buttons move: "Move Section 1 up".
  label: string;
  onMove: (fromIndex: number, toIndex: number) => void;
  onMoved: (announcement: string) => void;
}

// Move up and Move down: reorder an entry by touch, or by any pointer without dragging. Each
// moves the entry one place, keeps focus on it and announces the new position, as the handle's
// arrow keys do.
export function ReorderMoveButtons({
  buttonClassName,
  count,
  handleId,
  index,
  label,
  onMove,
  onMoved,
}: ReorderMoveButtonsProps): JSX.Element {
  function move(direction: ReorderDirection): void {
    const announcement = moveWithButton(direction, { count, handleId, index, label }, onMove);
    if (announcement) onMoved(announcement);
  }

  return (
    <>
      <Button
        aria-label={`Move ${label} up`}
        className={cn("text-muted-foreground", buttonClassName)}
        data-reorder-move={`${handleId}:up`}
        disabled={index === 0}
        onClick={() => move("up")}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <ArrowUp />
      </Button>
      <Button
        aria-label={`Move ${label} down`}
        className={cn("text-muted-foreground", buttonClassName)}
        data-reorder-move={`${handleId}:down`}
        disabled={index >= count - 1}
        onClick={() => move("down")}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <ArrowDown />
      </Button>
    </>
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
