import React, { createContext, useCallback, useContext, useMemo } from "react";
import { useAuth } from "./CloudflareAuthContext";
import { useWorkspace } from "./WorkspaceContext";
import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { isStaleRecordError } from "@/lib/editConflicts";
import { markRunShared } from "@/lib/queryCache";
import { prepareTemplatesForImport } from "@/lib/utils/templateBackup";
import { buildTemplateUpdateRequest, describeTemplateUpdate } from "@/lib/templates/templateUpdate";
import { MAX_TEMPLATES_PER_IMPORT } from "@/lib/templates/templateImportLimits";
import { RUN_TITLE_MAX } from "@/lib/schemas/templateLimits";
import { 
  ChecklistTemplate, 
  ChecklistRun, 
  ChecklistSection,
  TemplateSavePayload,
  TemplateImportOptions,
  TemplateImportSummary,
  TemplatesContextProps 
} from "@/types/checklist";

// Re-export types for backwards compatibility
export type {
  ChecklistSubItem,
  ChecklistItemContent,
  ChecklistItem,
  ChecklistSection,
  ChecklistTemplate,
  ChecklistRun
} from "@/types/checklist";

import { generateSlug } from "@/utils/urlHelpers";
import { resetSectionsCompletion } from "@/lib/utils/checklistSections";
import { resolveTemplateDestinationTeamId } from "@/lib/templateDestination";
import {
  isRepoTemplate,
  mergeAccountTemplateCollections,
  mergePublicTemplateCollections,
  repoTemplates,
} from "@/lib/repoTemplateCatalog";
import {
  refreshAfterRunDelete,
  refreshAfterRunRevalidated,
  refreshAfterTemplateDelete,
  refreshAfterTemplateSave,
  refreshRunLists,
  refreshRunsAfterConflict,
} from "./templateListCache";
import {
  CATALOG_QUERY_KEY,
  createTemplateListFetcher,
  fetchRunList,
  shouldRetryListFetch,
  type TemplateListRequest,
} from "./templateListFetchers";

export { mapApiTemplate } from "./templateListFetchers";
import { buildRunUpdatePayload, type RunUpdateOptions } from "./runUpdatePayload";
import { assertWorkspaceReady } from "./workspaceSelection";
import {
  getTemplateListReadiness,
  listLoadError,
  resolveTemplateListObservers,
  type TemplateListOptions,
  type TemplateListReadiness,
} from "./templateListObservers";


const TemplatesContext = createContext<TemplatesContextProps | undefined>(undefined);
const fetchTemplateList = createTemplateListFetcher(api);
// Shared empty lists keep `templates`, `allTemplates` and `runs` stable before a list loads.
const EMPTY_TEMPLATES: ChecklistTemplate[] = [];
const EMPTY_RUNS: ChecklistRun[] = [];

type TemplateListQuery = UseQueryOptions<ChecklistTemplate[]>;
type TemplateListQueries = TemplateListReadiness & { catalog: TemplateListQuery; workspace: TemplateListQuery };
const TemplateListQueriesContext = createContext<
  (TemplateListQueries & { runs: UseQueryOptions<ChecklistRun[]> }) | undefined
>(undefined);

// Lists load only on pages that call useTemplateLists(), because a catalog miss reads every
// public Template from D1. The catalog (?scope=public) is identical for everyone and
// edge-cached, so its key has no user. The workspace list is the user's own Personal
// templates (?scope=personal) or the active Organization's. The workspace list waits until the
// session and active workspace are known (`ready`), or a page would also fetch a list it does
// not need. The catalog waits only for the session (`catalogReady`, see templateListObservers).
export const buildTemplateListQueries = (params: TemplateListReadiness & {
  userId?: string;
  activeTeamId?: string;
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
    teamId?: string;
    template_id?: string;
    title: string;
    sections?: ChecklistSection[];
    status: "in_progress";
  };
  runSections: ChecklistSection[];
  title: string;
};

export function buildCreateRunRequest(params: {
  activeTeamId?: string;
  runName?: string;
  template: ChecklistTemplate;
  templateId: string;
}): CreateRunRequest {
  const runSections = resetSectionsCompletion(params.template.sections);
  // Template titles can be longer than a run title may be (imports, older rows).
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

// Loads data for pages that read `templates` (the catalog), `allTemplates` (the active
// workspace, merged with the catalog in Personal), or `runs`. See buildTemplateListQueries.
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
  // Use this page's queries for loading and errors: the provider's observers hear of fetches a
  // tick late. An error is reported only for a list with no data (see listLoadError).
  const context = useTemplates();
  return {
    ...context,
    templatesLoading: templatesWaiting || catalog.isLoading || workspace.isLoading,
    runsLoading: runsWaiting || runs.isLoading,
    templatesError: listLoadError(workspaceEnabled, workspace) ?? listLoadError(catalogEnabled, catalog),
    runsError: listLoadError(runsEnabled, runs),
    refetchTemplates: () => Promise.all([workspaceEnabled && workspace.refetch(), catalogEnabled && catalog.refetch()]),
    refetchRuns: () => (runsEnabled ? runs.refetch() : Promise.resolve()),
    // `templates` always holds the bundled repo templates, so a non-empty list does not mean
    // the catalog loaded. isPending covers the wait for the session (query disabled) and the
    // first request, but not a background refetch of a cached catalog.
    catalogPending: options.catalog === true && catalog.isPending,
    catalogError: options.catalog === true && listLoadError(catalogEnabled, catalog) !== null,
    refetchCatalog: catalog.refetch,
  };
};

export const TemplatesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { activeTeamId, isWorkspaceLoading, workspaceScopeId, workspaceStatus } = useWorkspace();
  const queryClient = useQueryClient();

  // These observers read whatever useTemplateLists() has loaded, without fetching.
  const { ready, catalogReady } = getTemplateListReadiness({ isAuthLoading: Boolean(isAuthLoading), isWorkspaceLoading });
  const listQueryContext = useMemo(() => {
    const lists = buildTemplateListQueries({
      ready,
      catalogReady,
      userId: user?.id,
      activeTeamId,
      workspaceScopeId,
      fetchList: fetchTemplateList,
    });
    // Runs load on demand too: useTemplateLists({ runs: true }) on the runs page only.
    const runs: UseQueryOptions<ChecklistRun[]> = {
      queryKey: ['runs', user?.id, workspaceScopeId],
      queryFn: async (): Promise<ChecklistRun[]> => (user ? fetchRunList(api, activeTeamId) : []),
      enabled: ready && !!user,
      staleTime: 5 * 60 * 1000,
      retry: shouldRetryListFetch,
    };
    return { ...lists, runs };
  }, [activeTeamId, catalogReady, ready, user, workspaceScopeId]);
  const { data: catalogApiTemplates = EMPTY_TEMPLATES, isLoading: catalogTemplatesLoading } = useQuery({ ...listQueryContext.catalog, enabled: false });
  const { data: loadedWorkspaceTemplates, isLoading: workspaceTemplatesLoading } = useQuery({ ...listQueryContext.workspace, enabled: false });
  const workspaceTemplates = loadedWorkspaceTemplates ?? EMPTY_TEMPLATES;
  const { data: runs = EMPTY_RUNS, isLoading: runsLoading } = useQuery({ ...listQueryContext.runs, enabled: false });

  const publicTemplates = useMemo(
    () => mergePublicTemplateCollections(repoTemplates, catalogApiTemplates),
    [catalogApiTemplates],
  );

  // Combine public templates with user's own templates (both public and private)
  const allTemplates = useMemo(
    () =>
      activeTeamId
        ? workspaceTemplates
        : mergeAccountTemplateCollections(publicTemplates, loadedWorkspaceTemplates, user?.id),
    [activeTeamId, publicTemplates, workspaceTemplates, loadedWorkspaceTemplates, user?.id],
  );
  const templatesLoading = catalogTemplatesLoading || workspaceTemplatesLoading;

  // Mutations only do cache work and reject on failure. The page that calls one shows the
  // result, so never toast here: it would duplicate (or contradict) the page's feedback.
  const createTemplateMutation = useMutation({
    mutationFn: async (templateData: Omit<ChecklistTemplate, "id" | "userId" | "createdAt" | "updatedAt" | "slug">) => {
      if (!user) throw new Error("User must be logged in to create a template");
      
      const finalIsPublic = templateData.isPublic ?? true;

      // Until the stored Organization is confirmed, the active context reads as Personal.
      if (!templateData.teamId) assertWorkspaceReady(workspaceStatus);
      const teamId = templateData.teamId ?? activeTeamId;
      const result = await api.createTemplate({
        title: templateData.title,
        teamId,
        description: templateData.description,
        type: templateData.type,
        seoTitle: templateData.seoTitle,
        seoDescription: templateData.seoDescription,
        rules: templateData.rules,
        slug: templateData.seoUrl?.trim() || undefined,
        sections: templateData.sections,
        is_public: finalIsPublic,
        categories: templateData.categories || [],
        tags: templateData.tags || []
      });
      
      return {
        id: result.id,
        title: templateData.title,
        description: templateData.description || '',
        type: templateData.type,
        seoTitle: templateData.seoTitle || '',
        seoDescription: templateData.seoDescription || '',
        rules: templateData.rules,
        seoUrl: result.slug || templateData.seoUrl || generateSlug(templateData.title),
        sections: templateData.sections,
        categories: templateData.categories || [],
        tags: templateData.tags || [],
        userId: user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isPublic: finalIsPublic,
        slug: result.slug || generateSlug(templateData.title),
        version: 1,
        teamId,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    }
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async (template: TemplateSavePayload) => {
      if (!user) throw new Error("User must be logged in to update a template");

      // Resolves with the stored version, which the caller keeps for its next save.
      return api.updateTemplate(template.id, buildTemplateUpdateRequest(template));
    },
    // Only a checklist-structure change reconciles runs, so only then do the run lists reload.
    onSuccess: (result, template) =>
      refreshAfterTemplateSave(queryClient, template.id, { runs: describeTemplateUpdate(result).invalidateRuns }),
    // A conflict means the cached copy is stale: lists reload when a page shows them again.
    onError: (error) => {
      if (isStaleRecordError(error)) void queryClient.invalidateQueries({ queryKey: ['templates'], refetchType: 'none' });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("User must be logged in to delete a template");
      
      await api.deleteTemplate(id);
      return true;
    },
    onSuccess: (_deleted, id) => refreshAfterTemplateDelete(queryClient, id),
  });

  const createRunMutation = useMutation({
    mutationFn: async ({ templateId, runName, template: loadedTemplate }: { templateId: string; runName?: string; template?: ChecklistTemplate }) => {
      if (!user) throw new Error("User must be logged in to create a run");
      
      // Pages that loaded the template pass it, since lists load only on demand.
      const template = loadedTemplate ??
        allTemplates.find((t: { id: unknown }) => t.id === templateId) ??
        publicTemplates.find((t: { id: unknown }) => t.id === templateId);
      if (!template) throw new Error("Template not found");

      const { apiPayload, runSections, title } = buildCreateRunRequest({
        activeTeamId,
        runName,
        template,
        templateId,
      });

      if (apiPayload.teamId === activeTeamId) assertWorkspaceReady(workspaceStatus);
      const result = await api.createChecklist(apiPayload);
      
      if (!result) throw new Error("Failed to create checklist run");
      
      return {
        id: result.id,
        templateId: templateId,
        title,
        status: "in_progress" as const,
        progress: 0,
        sections: runSections,
        startedAt: new Date().toISOString(),
        completedAt: undefined,
        userId: user.id,
        teamId: apiPayload.teamId,
        templateVersion: template.version || 1,
        revision: 1,
        isPublic: false,
      };
    },
    onSuccess: async () => {
      await refreshRunLists(queryClient);
    }
  });

  const updateRunMutation = useMutation({
    mutationFn: async ({ run, options }: { run: ChecklistRun; options?: RunUpdateOptions }) => {
      if (!user) throw new Error("User must be logged in to update a run");
      const payload = buildRunUpdatePayload(run, options);
      const result = await api.updateChecklist(run.id, payload);
      return {
        ...run,
        progress: payload.progress,
        revision: typeof result?.revision === 'number' ? result.revision : run.revision,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
    }
  });

  const deleteRunMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("User must be logged in to delete a run");
      
      await api.deleteChecklist(id);
      return true;
    },
    onSuccess: () => refreshAfterRunDelete(queryClient),
  });

  const revalidateRunMutation = useMutation({
    mutationFn: async (run: ChecklistRun) => {
      if (!user) throw new Error('User must be logged in to revalidate a run');
      await api.revalidateChecklist(run.id, run.revision);
    },
    onSuccess: (_result, run) => refreshAfterRunRevalidated(queryClient, run.id),
    onError: (error) => refreshRunsAfterConflict(queryClient, error),
  });

  const importTemplatesMutation = useMutation({
    mutationFn: async ({ templatesData, options }: { templatesData: ChecklistTemplate[]; options?: TemplateImportOptions }): Promise<TemplateImportSummary> => {
      if (!user) throw new Error("User must be logged in to import templates");
      assertWorkspaceReady(workspaceStatus);

      if (templatesData.length > MAX_TEMPLATES_PER_IMPORT) {
        throw new Error(`Import limited to ${MAX_TEMPLATES_PER_IMPORT} templates per file for now`);
      }

      // Asset sizes are checked per template by the API (oversized_asset), so one
      // template never blocks the others in the file.
      
      const templatesToImport = prepareTemplatesForImport(templatesData, user.id, options);
      return api.importTemplateBackup({
        teamId: activeTeamId,
        templates: templatesToImport,
        options: { visibility: options?.visibility ?? "preserve" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    }
  });

  // Helpers and the context value keep their identity until the data they read changes, so
  // consumers do not re-render on unrelated renders.
  const getTemplate = useCallback((id: string) => allTemplates.find((template) => template.id === id), [allTemplates]);
  const getTemplateBySlug = useCallback((slug: string) => allTemplates.find((template) => template.slug === slug), [allTemplates]);
  const getRun = useCallback((id: string) => runs.find((run) => run.id === id), [runs]);
  const getRunsForTemplate = useCallback((templateId: string) => runs.filter((run) => run.templateId === templateId), [runs]);
  const getAllPublicTemplates = useCallback(() => publicTemplates, [publicTemplates]);

  // mutateAsync keeps its identity for the life of the provider.
  const { mutateAsync: createTemplate } = createTemplateMutation;
  const { mutateAsync: updateTemplate } = updateTemplateMutation;
  const { mutateAsync: deleteTemplateAsync } = deleteTemplateMutation;
  const { mutateAsync: createRun } = createRunMutation;
  const { mutateAsync: updateRunAsync } = updateRunMutation;
  const { mutateAsync: revalidateRunAsync } = revalidateRunMutation;
  const { mutateAsync: deleteRunAsync } = deleteRunMutation;
  const { mutateAsync: importTemplatesAsync } = importTemplatesMutation;

  const value = useMemo<TemplatesContextProps>(() => ({
    templates: publicTemplates,
    allTemplates,
    templatesLoading,
    runs,
    runsLoading,
    getTemplate,
    getTemplateBySlug,
    getRun,
    getRunsForTemplate,
    getAllPublicTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate: async (id: string) => {
      await deleteTemplateAsync(id);
    },
    createRun,
    updateRun: (run: ChecklistRun, options?: RunUpdateOptions) => updateRunAsync({ run, options }),
    revalidateRun: async (run: ChecklistRun) => {
      await revalidateRunAsync(run);
    },
    markRunShared: (runId: string) => void markRunShared(queryClient, runId),
    deleteRun: async (id: string) => {
      await deleteRunAsync(id);
    },
    importTemplates: (templatesData: ChecklistTemplate[], options?: TemplateImportOptions): Promise<TemplateImportSummary> =>
      importTemplatesAsync({ templatesData, options }),
  }), [
    allTemplates, createRun, createTemplate, deleteRunAsync, deleteTemplateAsync, getAllPublicTemplates, getRun,
    getRunsForTemplate, getTemplate, getTemplateBySlug, importTemplatesAsync, publicTemplates, queryClient,
    revalidateRunAsync, runs, runsLoading, templatesLoading, updateRunAsync, updateTemplate,
  ]);

  return (
    <TemplatesContext.Provider value={value}>
      <TemplateListQueriesContext.Provider value={listQueryContext}>
        {children}
      </TemplateListQueriesContext.Provider>
    </TemplatesContext.Provider>
  );
};
