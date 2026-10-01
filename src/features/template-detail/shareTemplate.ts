import { api } from '@/lib/api';
import { isRepoTemplate } from '@/lib/repoTemplateCatalog';
import { buildCanonicalPublicTemplatePath } from '@/lib/routes';
import type { ChecklistTemplate } from '@/types/checklist';

import {
  applyTemplateSaveResult,
  mapTemplateChangeFailure,
  resolveShareOwnerTemplate,
  type TemplateDetailActionResult,
  type TemplateDetailApiClient,
  tryRefreshTemplateLists,
} from './templateDetailApi';

const SHARE_FAILED_MESSAGE = 'Failed to create a share link for this template.';

export const shareTemplateToPublic = async (params: {
  apiClient?: TemplateDetailApiClient;
  canShare: boolean;
  invalidateTemplates?: () => Promise<void> | void;
  isAuthenticated: boolean;
  onTemplateChange: (template: ChecklistTemplate) => void;
  origin: string;
  reloadAfterConflict?: () => Promise<void>;
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
  let nextTemplate = await resolveShareOwnerTemplate(
    params.template,
    { userId: params.userId, username: params.username },
    apiClient,
  );

  if (!buildCanonicalPublicTemplatePath(nextTemplate)) {
    return {
      kind: 'error',
      message: isCreator
        ? 'Set a username on your account before sharing templates with the canonical public URL.'
        : SHARE_FAILED_MESSAGE,
    };
  }

  const isPublicLibraryTemplate = nextTemplate.isPublic && isRepoTemplate(nextTemplate);
  if (!isPublicLibraryTemplate) {
    try {
      const saved = await apiClient.updateTemplate(nextTemplate.id, {
        is_public: true,
        expected_version: nextTemplate.version,
      });
      nextTemplate = applyTemplateSaveResult(nextTemplate, { isPublic: true }, saved);
    } catch (error) {
      return mapTemplateChangeFailure(error, SHARE_FAILED_MESSAGE, params.reloadAfterConflict);
    }
  }

  params.onTemplateChange({ ...nextTemplate, isPublic: true });
  await tryRefreshTemplateLists(params.invalidateTemplates);

  const publicPath = buildCanonicalPublicTemplatePath(nextTemplate);
  return publicPath
    ? { kind: 'ok', shareUrl: `${params.origin}${publicPath}` }
    : { kind: 'error', message: SHARE_FAILED_MESSAGE };
};
