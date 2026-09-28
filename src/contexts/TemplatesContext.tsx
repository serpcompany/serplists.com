import React, { createContext, useContext, useMemo } from "react";
import { useAuth } from "./CloudflareAuthContext";
import { useWorkspace } from "./WorkspaceContext";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { prepareTemplatesForImport } from "@/lib/utils/templateBackup";
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
import { calculateSectionsProgress, isSectionsShape, normalizeSections, resetSectionsCompletion } from "@/lib/utils/checklistSections";
import { fetchTemplateList, type TemplateListRequest } from "./templateListFetch";
import {
  isRepoTemplate,
  mergeAccountTemplateCollections,
  mergePublicTemplateCollections,
  repoTemplates,
} from "@/lib/repoTemplateCatalog";


const TemplatesContext = createContext<TemplatesContextProps | undefined>(undefined);

type TemplateListQuery = UseQueryOptions<ChecklistTemplate[]>;
type TemplateListQueries = { catalog: TemplateListQuery; workspace: TemplateListQuery; ready: boolean };
const TemplateListQueriesContext = createContext<
  (TemplateListQueries & { runs: UseQueryOptions<ChecklistRun[]> }) | undefined
>(undefined);

// Lists load only on pages that call useTemplateLists(), because a catalog miss reads every
// public Template from D1. The catalog (?scope=public) is identical for everyone and
// edge-cached, so its key has no user. The workspace list is the user's own Personal
// templates (?scope=personal) or the active Organization's. Nothing loads until the session
// and active workspace are known, or a page would also fetch a list it does not need.
export const buildTemplateListQueries = (params: {
  ready: boolean;
  userId?: string;
  activeTeamId?: string;
  workspaceScopeId: string;
  fetchList: (request: TemplateListRequest) => () => Promise<ChecklistTemplate[]>;
}): TemplateListQueries => ({
  catalog: { queryKey: ['templates', 'catalog'], queryFn: params.fetchList({ scope: 'public' }), staleTime: 5 * 60 * 1000 },
  workspace: {
    queryKey: ['templates', params.userId ?? 'visitor', params.workspaceScopeId],
    queryFn: params.fetchList(params.activeTeamId ? { teamId: params.activeTeamId } : { scope: 'personal' }),
    staleTime: 5 * 60 * 1000,
    enabled: params.ready && Boolean(params.userId),
  },
  ready: params.ready,
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
  const title = params.runName || params.template.title;

  if (isRepoTemplate(params.template)) {
    return {
      apiPayload: {
        teamId: params.activeTeamId,
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
      teamId: params.activeTeamId,
      title,
      status: "in_progress",
    },
    runSections,
    title,
  };
}

// calculateSectionsProgress is imported from lib/utils/checklistSections

export const useTemplates = () => {
  const context = useContext(TemplatesContext);
  if (!context) {
    throw new Error("useTemplates must be used within a TemplatesProvider");
  }
  return context;
};

// Loads data for pages that read `templates` (the catalog), `allTemplates` (the active
// workspace, merged with the catalog in Personal), or `runs`. See buildTemplateListQueries.
export const useTemplateLists = (options: { catalog?: boolean; workspace?: boolean; runs?: boolean } = {}) => {
  const queries = useContext(TemplateListQueriesContext);
  if (!queries) {
    throw new Error("useTemplateLists must be used within a TemplatesProvider");
  }
  const catalog = useQuery({ ...queries.catalog, enabled: queries.ready && options.catalog === true });
  const workspace = useQuery({ ...queries.workspace, enabled: queries.workspace.enabled !== false && options.workspace !== false });
  const runs = useQuery({ ...queries.runs, enabled: queries.runs.enabled !== false && options.runs === true });
  // Use this page's queries for loading: the provider's observers hear of fetches a tick late.
  const context = useTemplates();
  return {
    ...context,
    templatesLoading: !queries.ready || catalog.isLoading || workspace.isLoading,
    // `templates` always holds the bundled repo templates, so a non-empty list does not mean
    // the catalog loaded. isPending covers the wait for the session (query disabled) and the
    // first request, but not a background refetch of a cached catalog.
    catalogPending: options.catalog === true && catalog.isPending,
    catalogError: options.catalog === true && catalog.isError,
    refetchCatalog: catalog.refetch,
    runsLoading: !queries.ready || runs.isLoading,
  };
};

export const TemplatesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { activeTeamId, isWorkspaceLoading, workspaceScopeId } = useWorkspace();
  const queryClient = useQueryClient();

  // These observers read whatever useTemplateLists() has loaded, without fetching.
  const listQueries = buildTemplateListQueries({ ready: !isWorkspaceLoading, userId: user?.id, activeTeamId, workspaceScopeId, fetchList: fetchTemplateList });
  const { data: catalogApiTemplates = [], isLoading: catalogTemplatesLoading } = useQuery({ ...listQueries.catalog, enabled: false });
  const { data: workspaceTemplates = [], isLoading: workspaceTemplatesLoading } = useQuery({ ...listQueries.workspace, enabled: false });

  // Runs load on demand too: useTemplateLists({ runs: true }) on the runs page only.
  const runsQuery: UseQueryOptions<ChecklistRun[]> = {
    queryKey: ['runs', user?.id, workspaceScopeId],
    queryFn: async (): Promise<ChecklistRun[]> => {
      if (!user) return [];
      
      try {
        const checklistsData = await api.getChecklists(
          activeTeamId ? { teamId: activeTeamId } : undefined,
        );
        // Transform to run format
        const transformedRuns = checklistsData.map((checklist: Record<string, unknown>) => {
          const sections = (() => {
            const raw = typeof checklist.items === 'string' ? JSON.parse(checklist.items) : (checklist.items || []);
            if (isSectionsShape(raw)) return raw as ChecklistSection[];
            return [{ id: '1', title: 'Checklist', items: raw }];
          })();

          return ({
          id: checklist.id,
          templateId: checklist.template_id || '',
          title: checklist.title,
          status: (checklist.status || 'in_progress') as "in_progress" | "completed",
          sections: normalizeSections(sections),
          startedAt: checklist.started_at || checklist.created_at,
          completedAt: checklist.completed_at || undefined,
          userId: checklist.user_id || '',
          teamId: typeof checklist.team_id === 'string' ? checklist.team_id : undefined,
          templateVersion: typeof checklist.template_version === 'number' ? checklist.template_version : 1,
          revision: typeof checklist.revision === 'number' ? checklist.revision : 1,
          isStale: checklist.is_stale === true,
          isPublic: checklist.is_public === true || checklist.is_public === 1,
        });
        });

        return transformedRuns.map((r: ChecklistRun) => ({
          ...r,
          progress: calculateSectionsProgress(r.sections),
        }));
      } catch (error) {
        console.error('Error fetching runs:', error);
        return [];
      }
    },
    enabled: listQueries.ready && !!user,
    staleTime: 5 * 60 * 1000,
  };
  const { data: runs = [], isLoading: runsLoading } = useQuery({ ...runsQuery, enabled: false });

  const publicTemplates = useMemo(
    () => mergePublicTemplateCollections(repoTemplates, catalogApiTemplates),
    [catalogApiTemplates],
  );

  // Combine public templates with user's own templates (both public and private)
  const allTemplates = useMemo(
    () =>
      activeTeamId
        ? workspaceTemplates
        : mergeAccountTemplateCollections(publicTemplates, workspaceTemplates, user?.id),
    [activeTeamId, publicTemplates, workspaceTemplates, user?.id],
  );
  const templatesLoading = catalogTemplatesLoading || workspaceTemplatesLoading;

  // Mutations
  const createTemplateMutation = useMutation({
    mutationFn: async (templateData: Omit<ChecklistTemplate, "id" | "userId" | "createdAt" | "updatedAt" | "slug">) => {
      if (!user) throw new Error("User must be logged in to create a template");
      
      const finalIsPublic = templateData.isPublic ?? true;

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
      toast.success("Template created successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async (template: TemplateSavePayload) => {
      if (!user) throw new Error("User must be logged in to update a template");

      const result = await api.updateTemplate(template.id, {
        title: template.title,
        description: template.description,
        type: template.type,
        seoTitle: template.seoTitle,
        seoDescription: template.seoDescription,
        rules: template.rules,
        sections: template.sections,
        categories: template.categories,
        tags: template.tags,
        is_public: template.isPublic,
        slug: template.seoUrl?.trim() || template.slug?.trim() || undefined,
        expected_version: template.version,
      });
      
      if (!result) throw new Error('Failed to update template');
      return undefined;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
      await queryClient.invalidateQueries({ queryKey: ['runs'] });
      toast.success("Template updated. Checklist changes were reconciled into active private runs.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("User must be logged in to delete a template");
      
      await api.deleteTemplate(id);
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['runs'] });
    }
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
        teamId: activeTeamId,
        templateVersion: template.version || 1,
        revision: 1,
        isPublic: false,
      };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['runs'] });
      await queryClient.refetchQueries({ queryKey: ['runs'] });
      toast.success("Checklist run created successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  const updateRunMutation = useMutation({
    mutationFn: async (run: ChecklistRun) => {
      if (!user) throw new Error("User must be logged in to update a run");
      
      // Calculate progress
      let completed = 0;
      let total = 0;
      
      run.sections.forEach((section) => {
        section.items.forEach((item) => {
          total++;
          if (item.isCompleted) {
            completed++;
          }
          // Count sub-items if they exist
          item.contents?.forEach((content) => {
            if (content.type === "subItems" && content.subItems) {
              content.subItems.forEach((subItem) => {
                total++;
                if (subItem.isCompleted) {
                  completed++;
                }
              });
            }
          });
        });
      });
      
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
      const runWithProgress = { ...run, progress };
      
      const result = await api.updateChecklist(runWithProgress.id, {
        title: runWithProgress.title,
        status: runWithProgress.status,
        progress: runWithProgress.progress,
        sections: runWithProgress.sections,
        completed_at: runWithProgress.completedAt,
        expected_revision: runWithProgress.revision,
      });
      
      return {
        ...runWithProgress,
        revision: typeof result?.revision === 'number' ? result.revision : runWithProgress.revision,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
    }
  });

  const revalidateRunMutation = useMutation({
    mutationFn: async (run: ChecklistRun) => {
      if (!user) throw new Error('User must be logged in to revalidate a run');
      await api.revalidateChecklist(run.id, run.revision);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['runs'] });
      await queryClient.refetchQueries({ queryKey: ['runs'] });
    },
  });

  const importTemplatesMutation = useMutation({
    mutationFn: async ({ templatesData, options }: { templatesData: ChecklistTemplate[]; options?: TemplateImportOptions }): Promise<TemplateImportSummary> => {
      if (!user) throw new Error("User must be logged in to import templates");

      const MAX_TEMPLATES_PER_IMPORT = 5;
      const MAX_ASSET_BYTES = 5 * 1024 * 1024;

      const countOversizedAssets = (templates: ChecklistTemplate[]): number => {
        let count = 0;
        templates.forEach((template) => {
          template.sections.forEach((section) => {
            section.items.forEach((item) => {
              item.contents?.forEach((content) => {
                if (content.type !== "image" && content.type !== "video" && content.type !== "file") return;
                if (typeof content.fileSize === "number" && content.fileSize > MAX_ASSET_BYTES) {
                  count += 1;
                }
              });
            });
          });
        });
        return count;
      };

      if (templatesData.length > MAX_TEMPLATES_PER_IMPORT) {
        throw new Error(`Import limited to ${MAX_TEMPLATES_PER_IMPORT} templates per file for now`);
      }

      const oversizeAssets = countOversizedAssets(templatesData);
      if (oversizeAssets > 0) {
        throw new Error("Import blocked: one or more assets are over 5MB");
      }
      
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

  // Helper functions
  const getTemplate = (id: string): ChecklistTemplate | undefined => {
    return allTemplates.find((template: { id: unknown }) => template.id === id);
  };

  const getRun = (id: string): ChecklistRun | undefined => {
    return runs.find((run: { id: unknown }) => run.id === id);
  };

  const getRunsForTemplate = (templateId: string): ChecklistRun[] => {
    return runs.filter(run => run.templateId === templateId);
  };

  const getAllPublicTemplates = (): ChecklistTemplate[] => {
    return publicTemplates;
  };

  const getTemplateBySlug = (slug: string): ChecklistTemplate | undefined => {
    return allTemplates.find(template => template.slug === slug);
  };

  const importTemplatesWrapper = async (templatesData: ChecklistTemplate[], options?: TemplateImportOptions): Promise<TemplateImportSummary> => {
    return importTemplatesMutation.mutateAsync({ templatesData, options });
  };

  const value: TemplatesContextProps = {
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
    createTemplate: createTemplateMutation.mutateAsync,
    updateTemplate: updateTemplateMutation.mutateAsync,
    deleteTemplate: async (id: string) => {
      await deleteTemplateMutation.mutateAsync(id);
    },
    createRun: createRunMutation.mutateAsync,
    updateRun: updateRunMutation.mutateAsync,
    revalidateRun: async (run: ChecklistRun) => {
      await revalidateRunMutation.mutateAsync(run);
    },
    deleteRun: async (id: string) => {
      await deleteRunMutation.mutateAsync(id);
    },
    importTemplates: importTemplatesWrapper,
  };

  return (
    <TemplatesContext.Provider value={value}>
      <TemplateListQueriesContext.Provider value={{ ...listQueries, runs: runsQuery }}>
        {children}
      </TemplateListQueriesContext.Provider>
    </TemplatesContext.Provider>
  );
};
