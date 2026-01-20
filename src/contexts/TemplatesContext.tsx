import React, { createContext, useContext } from "react";
import { useAuth } from "./CloudflareAuthContext";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { prepareTemplatesForImport } from "@/lib/utils/templateBackup";
import { 
  ChecklistTemplate, 
  ChecklistRun, 
  ChecklistSection,
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


const TemplatesContext = createContext<TemplatesContextProps | undefined>(undefined);

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
  const queryClient = useQueryClient();

  // Fetch all public templates for visitors and logged-in users
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['templates', user?.id],
    queryFn: async () => {
      try {
        const templatesData = await api.getTemplates();
        
        // Transform API response to app format
        const transformedTemplates = templatesData.map((template: Record<string, unknown>) => ({
          id: template.id,
          title: template.title,
          description: template.description || '',
          sections: (() => {
            if (template.sections) return template.sections;
            if (template.items) {
              const parsedItems = typeof template.items === 'string' ? JSON.parse(template.items) : template.items;
              // Check if items is already in sections format
              if (Array.isArray(parsedItems) && parsedItems.length > 0 && parsedItems[0]?.items) {
                return parsedItems;
              }
              // Legacy format - wrap in single section
              return [{
                id: '1',
                title: 'Checklist',
                items: parsedItems
              }];
            }
            return [];
          })(),
          categories: Array.isArray(template.categories)
            ? template.categories
            : (template.category ? [String(template.category)] : []),
          tags: typeof template.tags === 'string' ? JSON.parse(template.tags) : (template.tags || []),
          userId: template.user_id,
          createdAt: template.created_at,
          updatedAt: template.updated_at,
          isPublic: Boolean(template.is_public),
          slug: template.slug || '',
          version: template.version || 1,
          ownerProfile: undefined
        }));

        return transformedTemplates.map((t: Record<string, unknown>) => ({
          ...t,
          sections: normalizeSections(t.sections),
        }));
      } catch (error) {
        console.error('Error fetching templates:', error);
        return [];
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
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
    queryKey: ['runs', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      try {
        const checklistsData = await api.getChecklists();
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

  // Combine public templates with user's own templates (both public and private)
  const allTemplates = [...templates, ...userTemplates];

  // Mutations
  const createTemplateMutation = useMutation({
    mutationFn: async (templateData: Omit<ChecklistTemplate, "id" | "userId" | "createdAt" | "updatedAt" | "slug">) => {
      if (!user) throw new Error("User must be logged in to create a template");
      
      const finalIsPublic = templateData.isPublic ?? true;

      const result = await api.createTemplate({
        title: templateData.title,
        description: templateData.description,
        sections: templateData.sections,
        is_public: finalIsPublic,
        categories: templateData.categories || [],
        tags: templateData.tags || []
      });
      
      return {
        id: result.id,
        title: templateData.title,
        description: templateData.description || '',
        sections: templateData.sections,
        categories: templateData.categories || [],
        tags: templateData.tags || [],
        userId: user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isPublic: finalIsPublic,
        slug: result.slug || generateSlug(templateData.title),
        version: 1
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
    mutationFn: async (template: ChecklistTemplate) => {
      if (!user) throw new Error("User must be logged in to update a template");
      
      console.log('Mutation - About to update template with:', {
        categories: template.categories,
        tags: template.tags,
        isPublic: template.isPublic
      });
      
      const result = await api.updateTemplate(template.id, {
        title: template.title,
        description: template.description,
        sections: template.sections,
        categories: template.categories,
        tags: template.tags,
        is_public: template.isPublic,
        slug: template.slug
      });
      
      if (!result) throw new Error('Failed to update template');
      return true;
    },
    onSuccess: () => {
      console.log('Update successful, invalidating queries...');
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['user-templates'] });
      queryClient.invalidateQueries({ queryKey: ['runs'] }); // Also invalidate runs since they get updated
      toast.success("Template updated successfully - all related runs have been updated");
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
      toast.success("Template deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  const createRunMutation = useMutation({
    mutationFn: async ({ templateId, runName }: { templateId: string; runName?: string }) => {
      if (!user) throw new Error("User must be logged in to create a run");
      
      const template = allTemplates.find((t: { id: unknown }) => t.id === templateId);
      if (!template) throw new Error("Template not found");
      
      // Create a deep copy of the template sections with isCompleted set to false
      const runSections = resetSectionsCompletion(template.sections);
      
      const result = await api.createChecklist({
        template_id: templateId,
        title: runName || template.title,
        sections: runSections,
        status: 'in_progress'
      });
      
      if (!result) throw new Error("Failed to create checklist run");
      
      return {
        id: result.id,
        templateId: templateId,
        title: runName || template.title,
        status: "in_progress" as const,
        progress: 0,
        sections: runSections,
        startedAt: new Date().toISOString(),
        completedAt: undefined,
        userId: user.id,
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
    },
    onError: (error: Error) => {
      toast.error(error.message);
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
      toast.success("Checklist run deleted successfully");
    },
    onError: (error: Error) => {
      console.error('Delete run error:', error);
      toast.error(error.message === 'Checklist not found or unauthorized' 
        ? 'Unable to delete this checklist. It may have already been deleted.'
        : `Failed to delete checklist: ${error.message}`);
    }
  });

  const importTemplatesMutation = useMutation({
    mutationFn: async ({ templatesData, options }: { templatesData: ChecklistTemplate[]; options?: TemplateImportOptions }): Promise<TemplateImportSummary> => {
      if (!user) throw new Error("User must be logged in to import templates");
      
      const templatesToImport = prepareTemplatesForImport(templatesData, user.id, options);
      const summary: TemplateImportSummary = { imported: 0, failed: [] };
      
      // Import templates one by one using the API
      for (const template of templatesToImport) {
        try {
          // Pass the full sections structure to preserve all content
          await api.createTemplate({
            title: template.title,
            description: template.description,
            sections: template.sections, // Preserve descriptions, contents, subItems
            is_public: template.isPublic,
            categories: template.categories || [],
            tags: template.tags || []
          });
          summary.imported += 1;
        } catch (error) {
          summary.failed.push({
            title: template.title,
            reason: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }
      
      if (summary.imported === 0 && summary.failed.length > 0) {
        throw new Error(summary.failed[0]?.reason || "Template import failed");
      }

      return summary;
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
    return templates;
  };

  const getTemplateBySlug = (slug: string): ChecklistTemplate | undefined => {
    return allTemplates.find(template => template.slug === slug);
  };

  const importTemplatesWrapper = async (templatesData: ChecklistTemplate[], options?: TemplateImportOptions): Promise<TemplateImportSummary> => {
    return importTemplatesMutation.mutateAsync({ templatesData, options });
  };

  const value: TemplatesContextProps = {
    templates,
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
    updateTemplate: updateTemplateMutation.mutate,
    deleteTemplate: deleteTemplateMutation.mutate,
    createRun: createRunMutation.mutateAsync,
    updateRun: updateRunMutation.mutate,
    deleteRun: deleteRunMutation.mutate,
    importTemplates: importTemplatesWrapper,
  };

  return (
    <TemplatesContext.Provider value={value}>
      {children}
    </TemplatesContext.Provider>
  );
};
