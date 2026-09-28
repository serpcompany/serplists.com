// Whether saving this edited run title would change anything. An empty title, or the saved
// title with spaces around it, is not a change: saving it would still send a PUT that bumps
// the revision and writes an audit event.
export const isRunTitleChange = (draft: string, savedTitle: string): boolean => {
  const title = draft.trim();
  return title.length > 0 && title !== savedTitle;
};
