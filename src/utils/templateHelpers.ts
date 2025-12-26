import { ChecklistTemplate, ChecklistRun } from "@/types/checklist";

/**
 * Gets template by ID from an array of templates
 */
export const getTemplateById = (templates: ChecklistTemplate[], templateId: string): ChecklistTemplate | undefined => {
  return templates.find(t => t.id === templateId);
};

/**
 * Gets template name by ID, with fallback
 */
export const getTemplateName = (templates: ChecklistTemplate[], templateId: string): string => {
  const template = getTemplateById(templates, templateId);
  return template ? template.title : "Unknown Template";
};

/**
 * Calculates progress percentage for a checklist run
 */
export const calculateProgress = (run: ChecklistRun): number => {
  if (!run.sections || run.sections.length === 0) return 0;
  
  const totalItems = run.sections.reduce((total, section) => total + section.items.length, 0);
  if (totalItems === 0) return 0;
  
  const completedItems = run.sections.reduce(
    (completed, section) => 
      completed + section.items.filter(item => item.isCompleted).length, 
    0
  );
  
  return Math.round((completedItems / totalItems) * 100);
};

/**
 * Groups runs by status
 */
export const groupRunsByStatus = (runs: ChecklistRun[]) => {
  const activeRuns = runs.filter(run => run.status === "in_progress");
  const completedRuns = runs
    .filter(run => run.status === "completed")
    .sort((a, b) => new Date(b.completedAt || "").getTime() - new Date(a.completedAt || "").getTime());
  
  return { activeRuns, completedRuns };
};

/**
 * Updates document title based on template data
 */
export const updateDocumentTitle = (template: ChecklistTemplate): void => {
  document.title = template.seoTitle || template.title || "Checklist Template";
};

/**
 * Gets the first incomplete item from a run
 */
export const getFirstIncompleteItem = (run: ChecklistRun): string | null => {
  for (const section of run.sections) {
    for (const item of section.items) {
      if (!item.isCompleted) {
        return item.id;
      }
    }
  }
  return null;
};

/**
 * Gets the first item from a run (fallback when all complete)
 */
export const getFirstItem = (run: ChecklistRun): string | null => {
  if (run.sections[0]?.items[0]) {
    return run.sections[0].items[0].id;
  }
  return null;
};