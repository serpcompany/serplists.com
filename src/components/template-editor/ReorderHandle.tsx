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
  label: string;
  index: number;
  count: number;
  handleId: string;
  hintId: string;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onMoved: (announcement: string) => void;
}

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
  buttonClassName?: string;
  count: number;
  handleId: string;
  index: number;
  label: string;
  onMove: (fromIndex: number, toIndex: number) => void;
  onMoved: (announcement: string) => void;
}

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
        className={cn("text-muted-foreground pointer-fine:hidden", buttonClassName)}
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
        className={cn("text-muted-foreground pointer-fine:hidden", buttonClassName)}
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
