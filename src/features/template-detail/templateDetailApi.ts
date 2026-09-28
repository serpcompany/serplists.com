import { getAccessFailure } from '@/lib/api-errors';
import type { api } from '@/lib/api';
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
  | { kind: 'ok'; runId?: string; shareUrl?: string; templateId?: string }
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

// Fills in the owner's username when the loaded row lacks it; the public URL needs it.
export const hydrateTemplateOwner = async (
  template: ChecklistTemplate,
  apiClient: TemplateDetailApiClient,
): Promise<ChecklistTemplate> => {
  const { ownerSlug } = resolveTemplateOwnerProfile(template);

  if (ownerSlug || !template.userId) {
    return template;
  }

  try {
    const profile = (await apiClient.getProfileById(
      template.userId,
    )) as Record<string, unknown>;
    return resolveTemplateOwnerProfile(template, profile).template;
  } catch {
    return template;
  }
};
