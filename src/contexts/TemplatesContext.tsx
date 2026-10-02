import { createContext, useContext } from "react";
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { resolveTemplateDestinationTeamId } from "@/lib/templateDestination";
import { isRepoTemplate } from "@/lib/repoTemplateCatalog";
import { RUN_TITLE_MAX } from "@/lib/schemas/templateLimits";
import { resetSectionsCompletion } from "@/lib/utils/checklistSections";
import type { ChecklistRun, ChecklistSection, ChecklistTemplate, TemplatesContextProps } from "@/types/checklist";

import { CATALOG_QUERY_KEY, shouldRetryListFetch, type TemplateListRequest } from "./templateListFetchers";
import {
  listLoadError,
  resolveTemplateListObservers,
  type TemplateListOptions,
  type TemplateListReadiness,
} from "./templateListObservers";

export const TemplatesContext = createContext<TemplatesContextProps | undefined>(undefined);

type TemplateListQuery = UseQueryOptions<ChecklistTemplate[]>;
export type TemplateListQueries = TemplateListReadiness & { catalog: TemplateListQuery; workspace: TemplateListQuery };
export const TemplateListQueriesContext = createContext<
  (TemplateListQueries & { runs: UseQueryOptions<ChecklistRun[]> }) | undefined
>(undefined);

export const buildTemplateListQueries = (params: TemplateListReadiness & {
  userId?: string | undefined;
  activeTeamId?: string | undefined;
  workspaceScopeId: string;
  fetchList: (request: TemplateListRequest) => () => Promise<ChecklistTemplate[]>;
}): TemplateListQueries => ({
  catalog: {
    queryKey: CATALOG_QUERY_KEY,
    queryFn: params.fetchList({ scope: 'public' }),
    staleTime: 5 * 60 * 1000,
    retry: shouldRetryListFetch,
  },
  workspace: {
    queryKey: ['templates', params.userId ?? 'visitor', params.workspaceScopeId],
    queryFn: params.fetchList(params.activeTeamId ? { teamId: params.activeTeamId } : { scope: 'personal' }),
    staleTime: 5 * 60 * 1000,
    retry: shouldRetryListFetch,
    enabled: params.ready && Boolean(params.userId),
  },
  ready: params.ready,
  catalogReady: params.catalogReady,
});

type CreateRunRequest = {
  apiPayload: {
    teamId?: string | undefined;
    template_id?: string;
    title: string;
    sections?: ChecklistSection[];
    status: "in_progress";
  };
  runSections: ChecklistSection[];
  title: string;
};

export function buildCreateRunRequest(params: {
  activeTeamId?: string | undefined;
  runName?: string | undefined;
  template: ChecklistTemplate;
  templateId: string;
}): CreateRunRequest {
  const runSections = resetSectionsCompletion(params.template.sections);
  const title = (params.runName || params.template.title).slice(0, RUN_TITLE_MAX).trimEnd();
  const teamId = resolveTemplateDestinationTeamId(params.template, params.activeTeamId);

  if (isRepoTemplate(params.template)) {
    return {
      apiPayload: {
        teamId,
        title,
        sections: runSections,
        status: "in_progress",
      },
      runSections,
      title,
    };
  }

  return {
    apiPayload: {
      template_id: params.templateId,
      teamId,
      title,
      status: "in_progress",
    },
    runSections,
    title,
  };
}

export const useTemplates = () => {
  const context = useContext(TemplatesContext);
  if (!context) {
    throw new Error("useTemplates must be used within a TemplatesProvider");
  }
  return context;
};

export const useTemplateLists = (options: TemplateListOptions = {}) => {
  const queries = useContext(TemplateListQueriesContext);
  if (!queries) {
    throw new Error("useTemplateLists must be used within a TemplatesProvider");
  }
  const { catalogEnabled, workspaceEnabled, runsEnabled, templatesWaiting, runsWaiting } =
    resolveTemplateListObservers(queries, options);
  const catalog = useQuery({ ...queries.catalog, enabled: catalogEnabled });
  const workspace = useQuery({ ...queries.workspace, enabled: workspaceEnabled });
  const runs = useQuery({ ...queries.runs, enabled: runsEnabled });
  const context = useTemplates();
  return {
    ...context,
    templatesLoading: templatesWaiting || catalog.isLoading || workspace.isLoading,
    runsLoading: runsWaiting || runs.isLoading,
    templatesError: listLoadError(workspaceEnabled, workspace) ?? listLoadError(catalogEnabled, catalog),
    runsError: listLoadError(runsEnabled, runs),
    refetchTemplates: () => Promise.all([workspaceEnabled && workspace.refetch(), catalogEnabled && catalog.refetch()]),
    refetchRuns: () => (runsEnabled ? runs.refetch() : Promise.resolve()),
    catalogPending: options.catalog === true && catalog.isPending,
    catalogError: options.catalog === true && listLoadError(catalogEnabled, catalog) !== null,
    refetchCatalog: catalog.refetch,
  };
};
