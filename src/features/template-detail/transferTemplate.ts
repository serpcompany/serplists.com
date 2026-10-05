import { api } from '@/lib/api';
import type { ChecklistTemplate } from '@/types/checklist';

import { mapTemplateChangeFailure, tryRefreshTemplateLists, type TemplateDetailActionResult } from './templateDetailApi';

const TRANSFER_FAILED_MESSAGE = 'Failed to transfer this template.';

export const transferTemplateToOrganization = async (params: {
  apiClient?: Pick<typeof api, 'transferTemplate'>;
  invalidateTemplates?: () => Promise<void> | void;
  onTemplateChange: (template: ChecklistTemplate) => void;
  reloadAfterConflict?: () => Promise<void>;
  teamId: string;
  template: ChecklistTemplate | null;
}): Promise<TemplateDetailActionResult> => {
  if (!params.template) return { kind: 'error', message: 'Template not found.' };
  try {
    const transferred = await (params.apiClient ?? api).transferTemplate(params.template.id, {
      teamId: params.teamId,
      expectedVersion: params.template.version ?? 1,
    });
    params.onTemplateChange({
      ...params.template,
      ownerType: 'team',
      teamId: transferred.teamId,
      version: transferred.version,
    });
    await tryRefreshTemplateLists(params.invalidateTemplates);
    return { kind: 'ok', templateId: transferred.id, teamId: transferred.teamId };
  } catch (error) {
    return mapTemplateChangeFailure(error, TRANSFER_FAILED_MESSAGE, params.reloadAfterConflict);
  }
};
