// The accessible name of a task's completion checkbox. It stays the same whether or not
// the task is ticked (aria-checked carries that), and an untitled task falls back to its
// position so the name is never blank.
export const getTaskCheckboxLabel = (title: string | undefined, position: number): string =>
  `Mark "${title?.trim() || `Task ${position}`}" complete`;
