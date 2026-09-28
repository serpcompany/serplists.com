import { api } from '@/lib/api';
import type { ChecklistTemplate } from '@/types/checklist';

import {
  mapActionFailure,
  type TemplateDetailActionResult,
  type TemplateDetailApiClient,
} from './templateDetailApi';

type TemplateUpdater = (current: ChecklistTemplate | null) => ChecklistTemplate | null;

const VISIBILITY_FAILED_MESSAGE = 'Failed to update template visibility';

/**
 * Changes a template's visibility and keeps the loaded template in step, so the page
 * shows what the server holds. Only `is_public` is sent: visibility alone does not
 * create a template version, so the loaded `version` stays valid for the next
 * Share or visibility change even when no list refetch reloads the template.
 */
export const setTemplateVisibility = async (params: {
  apiClient?: TemplateDetailApiClient;
  canEdit: boolean;
  invalidateTemplates?: () => Promise<void> | void;
  isPublic: boolean;
  onTemplateChange: (update: TemplateUpdater) => void;
  template: ChecklistTemplate | null;
}): Promise<TemplateDetailActionResult> => {
  if (!params.template || !params.canEdit) {
    return { kind: 'error', message: VISIBILITY_FAILED_MESSAGE };
  }

  const { id, version } = params.template;
  try {
    await (params.apiClient ?? api).updateTemplate(id, {
      expected_version: version,
      is_public: params.isPublic,
    });
  } catch (error) {
    return mapActionFailure(error, VISIBILITY_FAILED_MESSAGE);
  }

  // The page may have moved to another template while the request ran.
  params.onTemplateChange((current) =>
    current?.id === id ? { ...current, isPublic: params.isPublic } : current,
  );
  try {
    await params.invalidateTemplates?.();
  } catch {
    // The change is saved either way; lists catch up on their next fetch.
  }

  return { kind: 'ok' };
};
