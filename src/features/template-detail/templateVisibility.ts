import { api } from '@/lib/api';
import type { TemplateUpdateResult } from '@/lib/templateUpdateResult';
import type { ChecklistTemplate } from '@/types/checklist';

import {
  applyTemplateSaveResult,
  mapTemplateChangeFailure,
  type TemplateDetailActionResult,
  type TemplateDetailApiClient,
} from './templateDetailApi';

type TemplateUpdater = (current: ChecklistTemplate | null) => ChecklistTemplate | null;

const VISIBILITY_FAILED_MESSAGE = 'Failed to update template visibility';

/**
 * Changes a template's visibility and keeps the loaded template in step, so the page
 * shows what the server holds. Only `is_public` is sent, and the loaded template takes
 * the version and slug the PUT answer returns, so the next Share or visibility change
 * sends a current expected_version even when no refetch reloads the template.
 */
export const setTemplateVisibility = async (params: {
  apiClient?: TemplateDetailApiClient;
  canEdit: boolean;
  invalidateTemplates?: () => Promise<void> | void;
  isPublic: boolean;
  onTemplateChange: (update: TemplateUpdater) => void;
  // After a 409 edit conflict or a 404: load the stored template before re-enabling.
  reloadAfterConflict?: () => Promise<void>;
  template: ChecklistTemplate | null;
}): Promise<TemplateDetailActionResult> => {
  if (!params.template || !params.canEdit) {
    return { kind: 'error', message: VISIBILITY_FAILED_MESSAGE };
  }

  const { id, version } = params.template;
  let saved: TemplateUpdateResult;
  try {
    saved = await (params.apiClient ?? api).updateTemplate(id, {
      expected_version: version,
      is_public: params.isPublic,
    });
  } catch (error) {
    return mapTemplateChangeFailure(error, VISIBILITY_FAILED_MESSAGE, params.reloadAfterConflict);
  }

  // The page may have moved to another template while the request ran.
  params.onTemplateChange((current) =>
    current?.id === id
      ? applyTemplateSaveResult(current, { isPublic: params.isPublic }, saved)
      : current,
  );
  try {
    await params.invalidateTemplates?.();
  } catch {
    // The change is saved either way; lists catch up on their next fetch.
  }

  return { kind: 'ok' };
};
