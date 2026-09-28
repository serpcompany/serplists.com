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

/**
 * A failed change to the loaded template. A 409 edit conflict or a 404 means the loaded
 * copy is stale: it is reloaded from the server before the control re-enables, so the
 * next attempt sends the stored version instead of repeating the conflict.
 */
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

/**
 * The loaded template after a change the server accepted. PUT /api/templates/:id answers
 * with the version and slug it stored, and the next write sends that version as
 * expected_version. An answer without them keeps the loaded values.
 */
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
