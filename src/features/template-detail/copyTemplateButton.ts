import type { ChecklistTemplate } from '@/types/checklist';

import { canCopyTemplate } from './templatePermissions';
import type { TemplateDetailBillingState } from './useTemplateDetailModel';

export type CopyTemplateButton = {
  disabled: boolean;
  label: string;
  visible: boolean;
};

export const getCopyTemplateButton = (params: {
  billingState: TemplateDetailBillingState;
  canEditTemplates: boolean;
  isCloning: boolean;
  isTeamWorkspace: boolean;
  isWorkspaceLoading: boolean;
  template: Pick<ChecklistTemplate, 'id' | 'isPublic' | 'userId'> | null;
}): CopyTemplateButton => {
  if (!canCopyTemplate(params.template)) {
    return { disabled: true, label: '', visible: false };
  }

  if (params.isWorkspaceLoading) {
    return { disabled: true, label: 'Loading...', visible: true };
  }

  if (params.isTeamWorkspace) {
    return {
      disabled: params.isCloning,
      label: params.isCloning ? 'Copying...' : 'Copy to Organization',
      visible: params.canEditTemplates,
    };
  }

  const { isError, isLoading, isPro } = params.billingState;
  let label = 'Copy to My Templates';
  if (params.isCloning) {
    label = 'Copying...';
  } else if (isLoading) {
    label = 'Checking plan...';
  } else if (!isPro && !isError) {
    label = 'Upgrade to copy template';
  }

  return { disabled: params.isCloning || isLoading, label, visible: true };
};
