import type { ChecklistTemplate } from '@/types/checklist';

import { canCopyTemplate } from './templatePermissions';
import type { TemplateDetailBillingState } from './useTemplateDetailModel';

export type CopyTemplateButton = {
  disabled: boolean;
  label: string;
  visible: boolean;
};

/**
 * The copy button on another owner's template. It copies into the active context.
 * Personal copying is a Pro feature, so Personal shows the plan, but only a known Free
 * plan reads as an upgrade: a failed plan check is not Free. An Organization's
 * limits are checked by the API (a Free Organization may copy within its Template
 * limit), so the button never pre-judges them, and it is hidden from roles that
 * cannot add Templates to the Organization. The API clones only public templates, so
 * the button is hidden on a private one in every context.
 */
export const getCopyTemplateButton = (params: {
  billingState: TemplateDetailBillingState;
  canEditTemplates: boolean;
  isCloning: boolean;
  isTeamWorkspace: boolean;
  template: Pick<ChecklistTemplate, 'id' | 'isPublic' | 'userId'> | null;
}): CopyTemplateButton => {
  if (!canCopyTemplate(params.template)) {
    return { disabled: true, label: '', visible: false };
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
