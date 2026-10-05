import { api } from '@/lib/api';
import { isRepoTemplate } from '@/lib/repoTemplateCatalog';
import { buildCanonicalPublicTemplatePath } from '@/lib/routes';
import { isOrganizationTemplate } from '@/lib/templates/templateOwnership';
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
const ORGANIZATION_WITHOUT_HANDLE_MESSAGE =
  'This Organization needs a slug before its templates can be shared. Its owners and admins can set one in its settings.';
const CREATOR_WITHOUT_USERNAME_MESSAGE =
  'Set a username on your account before sharing templates with the canonical public URL.';

export const shareTemplateToPublic = async (params: {
  apiClient?: TemplateDetailApiClient;
  canShare: boolean;
  invalidateTemplates?: () => Promise<void> | void;
  isAuthenticated: boolean;
  onTemplateChange: (template: ChecklistTemplate) => void;
  origin: string;
  reloadAfterConflict?: () => Promise<void>;
  template: ChecklistTemplate | null;
  userId?: string | undefined;
  username?: string | undefined;
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
  const isOrganizationOwned = isOrganizationTemplate(params.template);
  let nextTemplate = isOrganizationOwned
    ? params.template
    : await resolveShareOwnerTemplate(
        params.template,
        { userId: params.userId, username: params.username },
        apiClient,
      );

  if (!buildCanonicalPublicTemplatePath(nextTemplate)) {
    if (isOrganizationOwned) return { kind: 'error', message: ORGANIZATION_WITHOUT_HANDLE_MESSAGE };
    const isCreator = params.template.userId === params.userId;
    return { kind: 'error', message: isCreator ? CREATOR_WITHOUT_USERNAME_MESSAGE : SHARE_FAILED_MESSAGE };
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
