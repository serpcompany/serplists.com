import React, { createContext, useContext } from "react";
import { useAuth } from "./CloudflareAuthContext";
import { useWorkspace } from "./WorkspaceContext";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  isRepoTemplate,
  mergeAccountTemplateCollections,
  mergePublicTemplateCollections,
  repoTemplates,
} from "@/lib/repoTemplateCatalog";


const TemplatesContext = createContext<TemplatesContextProps | undefined>(undefined);

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

export const TemplatesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { activeTeamId, workspaceScopeId } = useWorkspace();
  const queryClient = useQueryClient();

  const mapApiTemplate = (template: Record<string, unknown>): ChecklistTemplate => ({
    id: String(template.id),
    title: String(template.title || ''),
    description: typeof template.description === 'string' ? template.description : '',
    type: typeof template.type === 'string' ? template.type as "checklist" | "recipe" : 'checklist',
    seoTitle: typeof template.seoTitle === 'string' ? template.seoTitle : '',
    seoDescription: typeof template.seoDescription === 'string' ? template.seoDescription : '',
    rules: Array.isArray(template.rules) ? template.rules as ChecklistTemplate["rules"] : undefined,
    seoUrl: typeof template.slug === 'string' ? template.slug : '',
    sections: normalizeSections((() => {
      if (template.sections) return template.sections;
      if (template.items) {
        const parsedItems = typeof template.items === 'string' ? JSON.parse(template.items) : template.items;
        if (Array.isArray(parsedItems) && parsedItems.length > 0 && parsedItems[0]?.items) {
          return parsedItems;
        }
        return [{
          id: '1',
          title: 'Checklist',
          items: parsedItems
        }];
      }
      return [];
    })()),
    categories: Array.isArray(template.categories)
      ? template.categories as string[]
      : (template.category ? [String(template.category)] : []),
    tags: typeof template.tags === 'string' ? JSON.parse(template.tags) : (Array.isArray(template.tags) ? template.tags as string[] : []),
    userId: typeof template.user_id === 'string' ? template.user_id : '',
    createdAt: typeof template.created_at === 'string' ? template.created_at : '',
    updatedAt: typeof template.updated_at === 'string' ? template.updated_at : '',
    isPublic: Boolean(template.is_public),
    slug: typeof template.slug === 'string' ? template.slug : '',
    version: typeof template.version === 'number' ? template.version : 1,
    teamId:
      typeof template.team_id === 'string'
        ? template.team_id
        : typeof template.teamId === 'string'
          ? template.teamId
          : undefined,
    ownerProfile:
      typeof template.owner_username === "string" || typeof template.owner_full_name === "string"
        ? {
            username: typeof template.owner_username === "string" ? template.owner_username : undefined,
            full_name: typeof template.owner_full_name === "string" ? template.owner_full_name : undefined,
          }
        : undefined,
  });

  // Fetch catalog templates for public-facing pages. The merge step keeps only public templates.
  const { data: catalogApiTemplates = [], isLoading: catalogTemplatesLoading } = useQuery({
    queryKey: ['catalog-templates', user?.id],
    queryFn: async () => {
      try {
        const templatesData = await api.getTemplates();
        return templatesData.map((template: Record<string, unknown>) => mapApiTemplate(template));
      } catch (error) {
        console.error('Error fetching templates:', error);
        return [];
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch the templates owned by the active console workspace.
  const { data: workspaceTemplates = [], isLoading: workspaceTemplatesLoading } = useQuery({
    queryKey: ['templates', user?.id ?? 'visitor', workspaceScopeId],
    queryFn: async () => {
      try {
        const templatesData = await api.getTemplates(
          activeTeamId ? { teamId: activeTeamId } : undefined,
        );
        return templatesData.map((template: Record<string, unknown>) => mapApiTemplate(template));
      } catch (error) {
        console.error('Error fetching workspace templates:', error);
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch user's own templates (both public and private) if logged in
  const { data: userTemplates = [] } = useQuery({
    queryKey: ['user-templates', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      try {
        // For now, just return empty array - we'll use the public templates
        // In the future, we can add a user-specific endpoint
        return [];
      } catch (error) {
        console.error('Error fetching user templates:', error);
        return [];
      }
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch user's runs (only if logged in)
  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ['runs', user?.id, workspaceScopeId],
    queryFn: async () => {
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
          templateVersion: typeof checklist.template_version === 'number' ? checklist.template_version : 1
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
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const publicTemplates = mergePublicTemplateCollections(repoTemplates, catalogApiTemplates);

  // Combine public templates with user's own templates (both public and private)
  const allTemplates = activeTeamId
    ? workspaceTemplates
    : mergeAccountTemplateCollections(publicTemplates, workspaceTemplates, user?.id);
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
      queryClient.invalidateQueries({ queryKey: ['user-templates'] });
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
        slug: template.seoUrl?.trim() || template.slug?.trim() || undefined
      });
      
      if (!result) throw new Error('Failed to update template');
      return undefined;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
      await queryClient.invalidateQueries({ queryKey: ['user-templates'] });
      await queryClient.invalidateQueries({ queryKey: ['runs'] });
      toast.success("Template updated successfully. Section and item changes are synced to existing runs.");
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
      queryClient.invalidateQueries({ queryKey: ['user-templates'] });
      queryClient.invalidateQueries({ queryKey: ['runs'] });
    }
  });

  const createRunMutation = useMutation({
    mutationFn: async ({ templateId, runName }: { templateId: string; runName?: string }) => {
      if (!user) throw new Error("User must be logged in to create a run");
      
      const template =
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
        templateVersion: template.version || 1
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
      
      await api.updateChecklist(runWithProgress.id, {
        title: runWithProgress.title,
        status: runWithProgress.status,
        progress: runWithProgress.progress,
        sections: runWithProgress.sections,
        completed_at: runWithProgress.completedAt
      });
      
      return runWithProgress;
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
      queryClient.invalidateQueries({ queryKey: ['user-templates'] });
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
    deleteRun: async (id: string) => {
      await deleteRunMutation.mutateAsync(id);
    },
    importTemplates: importTemplatesWrapper,
  };

  return (
    <TemplatesContext.Provider value={value}>
      {children}
    </TemplatesContext.Provider>
  );
};
