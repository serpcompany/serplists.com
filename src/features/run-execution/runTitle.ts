export const isRunTitleChange = (draft: string, savedTitle: string): boolean => {
  const title = draft.trim();
  return title.length > 0 && title !== savedTitle;
};
