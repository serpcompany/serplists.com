import { api } from '@/lib/api';
import type { TemplateUpdateResult } from '@/lib/templateUpdateResult';
import type { ChecklistTemplate } from '@/types/checklist';

import {
  applyTemplateSaveResult,
  mapTemplateChangeFailure,
  type TemplateDetailActionResult,
  type TemplateDetailApiClient,
  tryRefreshTemplateLists,
} from './templateDetailApi';

type TemplateUpdater = (current: ChecklistTemplate | null) => ChecklistTemplate | null;

const VISIBILITY_FAILED_MESSAGE = 'Failed to update template visibility';

export const setTemplateVisibility = async (params: {
  apiClient?: TemplateDetailApiClient;
  canEdit: boolean;
  invalidateTemplates?: () => Promise<void> | void;
  isPublic: boolean;
  onTemplateChange: (update: TemplateUpdater) => void;
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

  params.onTemplateChange((current) =>
    current?.id === id
      ? applyTemplateSaveResult(current, { isPublic: params.isPublic }, saved)
      : current,
  );
  await tryRefreshTemplateLists(params.invalidateTemplates);

  return { kind: 'ok' };
};
