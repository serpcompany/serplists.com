export type TemplateListOptions = { catalog?: boolean; workspace?: boolean; runs?: boolean };

export type TemplateListReadiness = {
  ready: boolean;
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
    templatesWaiting: (catalogRequested && !queries.catalogReady) || (workspaceRequested && !queries.ready),
    runsWaiting: !queries.ready,
  };
};

export const listLoadError = <TError>(
  enabled: boolean,
  query: { data: unknown; error: TError | null },
): TError | null => (enabled && query.data === undefined ? query.error : null);
