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
} from './templateDetailApi';

const SHARE_FAILED_MESSAGE = 'Failed to create a share link for this template.';

// Resolves the public URL before changing visibility, so a template that cannot
// be shared is never published, and once it is published local state follows.
// The server confirms every Share, even when the loaded copy already says Public: a
// copy made private, archived or re-slugged elsewhere gets 409 or 404 and a reload
// instead of a dead link.
export const shareTemplateToPublic = async (params: {
  apiClient?: TemplateDetailApiClient;
  // From getTemplateDetailPermissions: edit rights, not who created the template.
  canShare: boolean;
  invalidateTemplates?: () => Promise<void> | void;
  isAuthenticated: boolean;
  onTemplateChange: (template: ChecklistTemplate) => void;
  origin: string;
  // After a 409 edit conflict or a 404: load the stored template before re-enabling.
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
  // The link lives under the Creator's username, so only the Creator's own (current) name
  // may stand in for the one a cached copy carries.
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

  // Public library templates are not stored rows, so there is nothing to confirm.
  if (!(nextTemplate.isPublic && isRepoTemplate(nextTemplate))) {
    try {
      // On a current copy that is already public this changes nothing on the server.
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
  try {
    await params.invalidateTemplates?.();
  } catch {
    // The template is public either way; lists catch up on their next fetch.
  }

  // Built from the slug the server returned, which can differ from the loaded one.
  const publicPath = buildCanonicalPublicTemplatePath(nextTemplate);
  return publicPath
    ? { kind: 'ok', shareUrl: `${params.origin}${publicPath}` }
    : { kind: 'error', message: SHARE_FAILED_MESSAGE };
};
