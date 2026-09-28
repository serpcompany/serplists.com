import type { QueryClient } from '@tanstack/react-query';

import type { TemplateUpdateResult } from '@/lib/templateUpdateResult';
import type { ChecklistTemplate } from '@/types/checklist';

import { applyTemplateSaveResult, type TemplateDetailLoader } from './templateDetailLoader';

// Keeps a template detail page and the caches current after its own changes.
export const createTemplateDetailRefresh = (params: {
  loader: TemplateDetailLoader;
  queryClient: QueryClient;
  template: ChecklistTemplate | null;
  userId?: string;
}) => ({
  invalidateTemplates: async () => {
    if (!params.userId) return;
    await params.queryClient.invalidateQueries({ queryKey: ['templates', params.userId] });
  },
  // A save made on this page (the visibility switch): show the version the server stored.
  recordTemplateSave: (change: Partial<ChecklistTemplate>, saved: TemplateUpdateResult) => {
    if (params.template) params.loader.setTemplate(applyTemplateSaveResult(params.template, change, saved));
  },
  // After a 409 edit conflict (or a 404): show the stored template and its history, so the
  // next change sends the current version instead of repeating the conflict.
  reloadTemplate: async () => {
    await params.loader.reload();
    if (params.template) {
      await params.queryClient.invalidateQueries({ queryKey: ['template-history', params.template.id] });
    }
  },
});
