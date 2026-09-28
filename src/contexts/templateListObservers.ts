// Which of TemplatesProvider's list queries a page's useTemplateLists() call turns on, and
// whether the lists it asked for are still waiting to start. Pure, so tests can check the
// rules without rendering.

export type TemplateListOptions = { catalog?: boolean; workspace?: boolean; runs?: boolean };

export type TemplateListReadiness = {
  // The session and the active context are known, so the workspace and runs lists may load.
  ready: boolean;
  // The session is known. The catalog is the same for everyone and its key has no user or
  // context, so it does not wait for the Organizations: a failed or slow teams request must
  // not hide the community templates on the public library, category and search pages.
  catalogReady: boolean;
};

export const getTemplateListReadiness = (params: {
  isAuthLoading: boolean;
  isWorkspaceLoading: boolean;
}): TemplateListReadiness => ({
  ready: !params.isAuthLoading && !params.isWorkspaceLoading,
  catalogReady: !params.isAuthLoading,
});

type ListQueryGate = { enabled?: unknown };

export const resolveTemplateListObservers = (
  queries: TemplateListReadiness & { workspace: ListQueryGate; runs: ListQueryGate },
  options: TemplateListOptions,
) => {
  const catalogRequested = options.catalog === true;
  const workspaceRequested = options.workspace !== false;
  return {
    catalogEnabled: queries.catalogReady && catalogRequested,
    workspaceEnabled: queries.workspace.enabled !== false && workspaceRequested,
    runsEnabled: queries.runs.enabled !== false && options.runs === true,
    // A list the page asked for that cannot start yet counts as loading.
    templatesWaiting: (catalogRequested && !queries.catalogReady) || (workspaceRequested && !queries.ready),
    runsWaiting: !queries.ready,
  };
};

// A failed refetch keeps the last good list, so a list reports an error only while it has no
// data. Decide on the list's own data, never on the length of a merged list: in Personal the
// cached catalog can hold some of the user's templates while the Personal list itself failed.
export const listLoadError = <TError>(
  enabled: boolean,
  query: { data: unknown; error: TError | null },
): TError | null => (enabled && query.data === undefined ? query.error : null);
