import { describe, expect, it, vi } from 'vitest';

import { getCopyTemplateButton } from '@/features/template-detail/copyTemplateButton';
import {
  saveTemplateToAccount,
} from '@/features/template-detail/templateActionOutcome';
import { createApiError } from '@/lib/api-errors';
import { REPO_TEMPLATE_USER_ID } from '@/lib/repoTemplateCatalog';
import type { ChecklistTemplate } from '@/types/checklist';

import {
  apiClientThatClones as buildApiClient,
  FREE_BILLING as freeOrganizationBilling,
} from '../../../fixtures/templateDetailApiClient';

const buildTemplate = (overrides: Partial<ChecklistTemplate> = {}): ChecklistTemplate => ({
  id: 'template-1',
  title: 'Camping Checklist',
  sections: [],
  userId: 'other-user',
  createdAt: '2026-04-18T00:00:00.000Z',
  updatedAt: '2026-04-18T00:00:00.000Z',
  isPublic: true,
  slug: 'camping-checklist',
  version: 1,
  ...overrides,
});

const copyIntoTheOrganization = (
  apiClient: ReturnType<typeof buildApiClient>,
  options: Partial<Parameters<typeof saveTemplateToAccount>[0]> = {},
) =>
  saveTemplateToAccount({
    apiClient,
    billingState: freeOrganizationBilling,
    createTemplate: vi.fn(),
    isAuthenticated: true,
    teamId: 'team-1',
    template: buildTemplate(),
    userId: 'user-1',
    ...options,
  });

describe('copying a public template into an Organization', () => {
  it('lets the API decide instead of blocking a Free Organization in the browser', async () => {
    const apiClient = buildApiClient();
    const invalidateTemplates = vi.fn();

    const result = await copyIntoTheOrganization(apiClient, { invalidateTemplates });

    expect(result).toEqual({ kind: 'ok', templateId: 'clone-1', teamId: 'team-1' });
    expect(apiClient.clonePublicTemplate).toHaveBeenCalledWith('template-1', {
      teamId: 'team-1',
      visibility: 'private',
    });
    expect(invalidateTemplates).toHaveBeenCalledTimes(1);
  });

  it('does not wait for the plan in an Organization', async () => {
    const apiClient = buildApiClient();

    const result = await copyIntoTheOrganization(apiClient, { billingState: { ...freeOrganizationBilling, isLoading: true } });

    expect(result.kind).toBe('ok');
  });

  it('reports a limit answer that names no context, as an API older than contexts sends, as an upgrade', async () => {
    const apiClient = buildApiClient(
      vi.fn().mockRejectedValue(
        createApiError(403, { code: 'limit_reached', error: 'Template limit reached.' }),
      ),
    );
    const invalidateTemplates = vi.fn();

    const result = await copyIntoTheOrganization(apiClient, { invalidateTemplates });

    expect(result).toEqual({ kind: 'upgrade_required' });
    expect(invalidateTemplates).not.toHaveBeenCalled();
  });

  it('reports a role the API refuses as an error, not an upgrade', async () => {
    const apiClient = buildApiClient(
      vi.fn().mockRejectedValue(createApiError(403, { error: 'Forbidden' })),
    );

    const result = await copyIntoTheOrganization(apiClient);

    expect(result).toEqual({ kind: 'error', message: 'Forbidden' });
  });

  it('copies library templates into a Free Organization too', async () => {
    const createTemplate = vi.fn().mockResolvedValue(buildTemplate({ id: 'created-1' }));

    const result = await copyIntoTheOrganization(buildApiClient(), {
      createTemplate,
      template: buildTemplate({ id: 'repo:camping', userId: REPO_TEMPLATE_USER_ID }),
    });

    expect(result).toEqual({ kind: 'ok', templateId: 'created-1' });
    expect(createTemplate).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'team-1' }));
  });

  it('still asks a Free Personal user to upgrade before copying', async () => {
    const apiClient = buildApiClient();

    const result = await copyIntoTheOrganization(apiClient, { teamId: undefined });

    expect(result).toEqual({ kind: 'upgrade_required' });
    expect(apiClient.clonePublicTemplate).not.toHaveBeenCalled();
  });
});

describe('getCopyTemplateButton', () => {
  const personal = {
    canEditTemplates: true,
    isCloning: false,
    isTeamWorkspace: false,
    isWorkspaceLoading: false,
    template: buildTemplate(),
  };
  const organization = { ...personal, isTeamWorkspace: true };

  it('offers the copy in an Organization whatever its plan says', () => {
    for (const billingState of [
      freeOrganizationBilling,
      { ...freeOrganizationBilling, isLoading: true },
      { ...freeOrganizationBilling, isPro: true },
    ]) {
      expect(getCopyTemplateButton({ ...organization, billingState })).toEqual({
        disabled: false,
        label: 'Copy to Organization',
        visible: true,
      });
    }
  });

  it('hides the copy from Organization roles that cannot add Templates', () => {
    expect(
      getCopyTemplateButton({
        ...organization,
        billingState: freeOrganizationBilling,
        canEditTemplates: false,
      }).visible,
    ).toBe(false);
  });

  it('keeps the Personal plan labels', () => {
    expect(
      getCopyTemplateButton({ ...personal, billingState: freeOrganizationBilling }),
    ).toEqual({ disabled: false, label: 'Upgrade to copy template', visible: true });
    expect(
      getCopyTemplateButton({
        ...personal,
        billingState: { ...freeOrganizationBilling, isLoading: true },
      }),
    ).toEqual({ disabled: true, label: 'Checking plan...', visible: true });
    expect(
      getCopyTemplateButton({
        ...personal,
        billingState: { ...freeOrganizationBilling, isPro: true },
      }),
    ).toEqual({ disabled: false, label: 'Copy to My Templates', visible: true });
  });

  it('waits for the active context, which shows Personal until a stored Organization is confirmed, before offering a Personal copy', () => {
    for (const billingState of [
      freeOrganizationBilling,
      { ...freeOrganizationBilling, isPro: true },
    ]) {
      expect(
        getCopyTemplateButton({ ...personal, billingState, isWorkspaceLoading: true }),
      ).toEqual({ disabled: true, label: 'Loading...', visible: true });
    }
  });

  it('shows progress while copying', () => {
    expect(
      getCopyTemplateButton({
        ...organization,
        billingState: freeOrganizationBilling,
        isCloning: true,
      }),
    ).toEqual({ disabled: true, label: 'Copying...', visible: true });
  });
});
