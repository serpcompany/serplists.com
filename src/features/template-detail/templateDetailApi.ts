import { getAccessFailure } from '@/lib/api-errors';
import type { api } from '@/lib/api';
import { getTemplateChangeErrorMessage, isStaleRecordError } from '@/lib/editConflicts';
import type { TemplateUpdateResult } from '@/lib/templateUpdateResult';
import type { ChecklistTemplate } from '@/types/checklist';

import { resolveTemplateOwnerProfile } from './templateDetailMappers';

export type TemplateDetailApiClient = Pick<
  typeof api,
  | 'clonePublicTemplate'
  | 'getBillingStatus'
  | 'getProfileById'
  | 'getTemplateById'
  | 'getTemplateBySlug'
  | 'updateTemplate'
>;

export type TemplateDetailActionResult =
  | { kind: 'ok'; runId?: string; shareUrl?: string; teamId?: string | undefined; templateId?: string }
  | { kind: 'login_required' }
  | { kind: 'upgrade_required' }
  | { kind: 'error'; message: string };

export const mapActionFailure = (
  error: unknown,
  fallbackMessage: string,
): TemplateDetailActionResult => {
  const failure = getAccessFailure(error, fallbackMessage);

  if (failure.kind === 'auth_required') {
    return { kind: 'login_required' };
  }

  if (failure.kind === 'upgrade_required') {
    return { kind: 'upgrade_required' };
  }

  return { kind: 'error', message: failure.message };
};

export const mapTemplateChangeFailure = async (
  error: unknown,
  fallbackMessage: string,
  reloadAfterConflict?: () => Promise<void>,
): Promise<TemplateDetailActionResult> => {
  if (!reloadAfterConflict || !isStaleRecordError(error)) {
    return mapActionFailure(error, fallbackMessage);
  }

  try {
    await reloadAfterConflict();
  } catch {
    return mapActionFailure(error, fallbackMessage);
  }
  return { kind: 'error', message: getTemplateChangeErrorMessage(error, fallbackMessage) };
};

export const tryRefreshTemplateLists = async (
  invalidateTemplates: (() => Promise<void> | void) | undefined,
): Promise<boolean> => {
  try {
    await invalidateTemplates?.();
    return true;
  } catch {
    return false;
  }
};

export const applyTemplateSaveResult = (
  template: ChecklistTemplate,
  change: Partial<ChecklistTemplate>,
  saved: Partial<TemplateUpdateResult> | undefined,
): ChecklistTemplate => ({
  ...template,
  ...change,
  version: typeof saved?.version === 'number' ? saved.version : template.version,
  slug: saved?.slug ?? template.slug,
});

export const hydrateTemplateOwner = async (
  template: ChecklistTemplate,
  apiClient: Pick<TemplateDetailApiClient, 'getProfileById'>,
): Promise<ChecklistTemplate> => {
  const { ownerSlug } = resolveTemplateOwnerProfile(template);

  if (ownerSlug || !template.userId) {
    return template;
  }

  try {
    const profile = await apiClient.getProfileById(template.userId);
    return resolveTemplateOwnerProfile(template, profile).template;
  } catch {
    return template;
  }
};

export const resolveShareOwnerTemplate = async (
  template: ChecklistTemplate,
  owner: { userId?: string | undefined; username?: string | undefined },
  apiClient: Pick<TemplateDetailApiClient, 'getProfileById'>,
): Promise<ChecklistTemplate> => {
  const username = owner.username?.trim();
  if (username && owner.userId && template.userId === owner.userId) {
    return { ...template, ownerProfile: { ...template.ownerProfile, username } };
  }

  if (owner.userId && template.userId && template.userId !== owner.userId) {
    try {
      const profile = await apiClient.getProfileById(template.userId);
      return resolveTemplateOwnerProfile(template, profile).template;
    } catch {
      return template;
    }
  }

  return hydrateTemplateOwner(template, apiClient);
};
