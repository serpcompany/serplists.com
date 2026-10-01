export const getTaskCheckboxLabel = (title: string | undefined, position: number): string =>
  `Mark "${title?.trim() || `Task ${position}`}" complete`;
