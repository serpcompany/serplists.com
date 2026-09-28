import { api } from '@/lib/api';
import { buildCanonicalPublicTemplatePath } from '@/lib/routes';
import type { ChecklistTemplate } from '@/types/checklist';

import {
  hydrateTemplateOwner,
  mapActionFailure,
  type TemplateDetailActionResult,
  type TemplateDetailApiClient,
} from './templateDetailApi';

const SHARE_FAILED_MESSAGE = 'Failed to create a share link for this template.';

// Resolves the public URL before changing visibility, so a template that cannot
// be shared is never published, and once it is published local state follows.
export const shareTemplateToPublic = async (params: {
  apiClient?: TemplateDetailApiClient;
  // From getTemplateDetailPermissions: edit rights, not who created the template.
  canShare: boolean;
  invalidateTemplates?: () => Promise<void> | void;
  isAuthenticated: boolean;
  onTemplateChange: (template: ChecklistTemplate) => void;
  origin: string;
  template: ChecklistTemplate | null;
  userId?: string;
  username?: string;
}): Promise<TemplateDetailActionResult> => {
  if (!params.template) {
    return { kind: 'error', message: 'Template not found.' };
  }
  if (!params.isAuthenticated || !params.userId) {
    return { kind: 'login_required' };
  }
  if (!params.canShare) {
    return { kind: 'error', message: 'You can only share templates you own.' };
  }

  const apiClient = params.apiClient ?? api;
  const isCreator = params.template.userId === params.userId;
  let nextTemplate = await hydrateTemplateOwner(params.template, apiClient);
  // The link lives under the Creator's username, so only the Creator's own name may stand in.
  if (!nextTemplate.ownerProfile?.username && params.username && isCreator) {
    nextTemplate = {
      ...nextTemplate,
      ownerProfile: { ...nextTemplate.ownerProfile, username: params.username },
    };
  }

  const publicPath = buildCanonicalPublicTemplatePath(nextTemplate);
  if (!publicPath) {
    return {
      kind: 'error',
      message: isCreator
        ? 'Set a username on your account before sharing templates with the canonical public URL.'
        : SHARE_FAILED_MESSAGE,
    };
  }

  if (!nextTemplate.isPublic) {
    try {
      await apiClient.updateTemplate(nextTemplate.id, {
        is_public: true,
        expected_version: nextTemplate.version,
      });
    } catch (error) {
      return mapActionFailure(error, SHARE_FAILED_MESSAGE);
    }
  }

  params.onTemplateChange({ ...nextTemplate, isPublic: true });
  try {
    await params.invalidateTemplates?.();
  } catch {
    // The template is public either way; lists catch up on their next fetch.
  }

  return { kind: 'ok', shareUrl: `${params.origin}${publicPath}` };
};
