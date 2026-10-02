import type { KeyboardEvent } from "react";

export const REORDER_KEYS_HINT = "Press the Up or Down arrow key to move it.";

export { HOVER_REVEAL_CLASS as ROW_ACTIONS_REVEAL_CLASS } from "@/components/ui/hover-reveal";

export type ReorderKeyEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>;

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

export type ReorderDirection = "up" | "down";

export function moveWithButton(
  direction: ReorderDirection,
  entry: KeyboardReorderEntry,
  move: (fromIndex: number, toIndex: number) => void,
): string | null {
  const toIndex = direction === "up" ? entry.index - 1 : entry.index + 1;
  if (toIndex < 0 || toIndex >= entry.count) return null;
  move(entry.index, toIndex);
  focusReorderMoveButton(entry.handleId, direction);
  return describeMove(entry.label, toIndex, entry.count);
}

export function dropIndicatorClass(edge: "after" | "before" | null): string | undefined {
  if (edge === "before") {
    return "before:absolute before:inset-x-1 before:-top-0.5 before:z-20 before:h-0.5 before:rounded-full before:bg-primary before:content-['']";
  }
  if (edge === "after") {
    return "after:absolute after:inset-x-1 after:-bottom-0.5 after:z-20 after:h-0.5 after:rounded-full after:bg-primary after:content-['']";
  }
  return undefined;
}

export function focusReorderHandle(handleId: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  window.requestAnimationFrame(() => {
    const handles = document.querySelectorAll<HTMLElement>("[data-reorder-handle]");
    for (const handle of handles) {
      if (handle.dataset["reorderHandle"] === handleId) {
        handle.focus();
        return;
      }
    }
  });
}

export function focusReorderMoveButton(handleId: string, direction: ReorderDirection): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  window.requestAnimationFrame(() => {
    const find = (dir: ReorderDirection) =>
      Array.from(document.querySelectorAll<HTMLButtonElement>("[data-reorder-move]")).find(
        (button) => button.dataset["reorderMove"] === `${handleId}:${dir}`,
      );
    const same = find(direction);
    const target = same && !same.disabled ? same : find(direction === "up" ? "down" : "up");
    target?.focus();
  });
}
