import type { KeyboardEvent } from "react";

// Reordering in the template editor. Sections, tasks and content blocks each have a drag
// handle; the same handle also moves its entry with the arrow keys, because HTML5 drag
// and drop needs a mouse.

export const REORDER_KEYS_HINT = "Press the Up or Down arrow key to move it.";

// Row actions (add, remove) that appear on hover must also appear when the keyboard
// reaches the row or the action itself, and on touch screens, which cannot hover.
export { HOVER_REVEAL_CLASS as ROW_ACTIONS_REVEAL_CLASS } from "@/components/ui/hover-reveal";

export type ReorderKeyEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>;

// The index an arrow key moves the entry to, clamped to the list (no wrapping). null
// means the key is not a reorder key and keeps its default behavior.
export function getKeyboardMoveIndex(
  event: ReorderKeyEvent,
  index: number,
  count: number,
): number | null {
  if (event.ctrlKey || event.metaKey || event.shiftKey) return null;
  if (event.key === "ArrowUp") return Math.max(0, index - 1);
  if (event.key === "ArrowDown") return Math.min(count - 1, index + 1);
  return null;
}

export function remapIndexAfterMove(index: number, fromIndex: number, toIndex: number): number {
  if (index === fromIndex) return toIndex;
  if (fromIndex < toIndex && index > fromIndex && index <= toIndex) return index - 1;
  if (toIndex < fromIndex && index >= toIndex && index < fromIndex) return index + 1;
  return index;
}

export function moveArrayEntry<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  if (movedItem === undefined) return items;
  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
}

export function describeMove(label: string, toIndex: number, count: number): string {
  return `Moved ${label} to position ${toIndex + 1} of ${count}`;
}

export type KeyboardReorderEntry = {
  count: number;
  handleId: string;
  index: number;
  label: string;
};

// Moves the entry for an arrow key and returns what to announce, or null when nothing
// moved. A reorder key is always consumed, even at either end, so it never scrolls.
export function handleKeyboardReorder(
  event: ReorderKeyEvent & { preventDefault: () => void },
  entry: KeyboardReorderEntry,
  move: (fromIndex: number, toIndex: number) => void,
): string | null {
  const toIndex = getKeyboardMoveIndex(event, entry.index, entry.count);
  if (toIndex === null) return null;
  event.preventDefault();
  if (toIndex === entry.index) return null;
  move(entry.index, toIndex);
  focusReorderHandle(entry.handleId);
  return describeMove(entry.label, toIndex, entry.count);
}

// The line a drop will land on: above or below the entry under the pointer.
export function dropIndicatorClass(edge: "after" | "before" | null): string | undefined {
  if (edge === "before") {
    return "before:absolute before:inset-x-1 before:-top-0.5 before:z-20 before:h-0.5 before:rounded-full before:bg-primary before:content-['']";
  }
  if (edge === "after") {
    return "after:absolute after:inset-x-1 after:-bottom-0.5 after:z-20 after:h-0.5 after:rounded-full after:bg-primary after:content-['']";
  }
  return undefined;
}

// React may re-insert the moved row's DOM node, which drops focus; put it back on the
// row's handle once the move has rendered. Handles carry data-reorder-handle.
export function focusReorderHandle(handleId: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  window.requestAnimationFrame(() => {
    const handles = document.querySelectorAll<HTMLElement>("[data-reorder-handle]");
    for (const handle of handles) {
      if (handle.dataset.reorderHandle === handleId) {
        handle.focus();
        return;
      }
    }
  });
}
