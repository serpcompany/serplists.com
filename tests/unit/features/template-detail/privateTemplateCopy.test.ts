import { describe, expect, it, vi } from 'vitest';

import { getCopyTemplateButton } from '@/features/template-detail/copyTemplateButton';
import { canCopyTemplate } from '@/features/template-detail/templatePermissions';
import {
  saveTemplateToAccount,
  type TemplateDetailBillingState,
} from '@/features/template-detail/useTemplateDetailModel';
import { REPO_TEMPLATE_USER_ID } from '@/lib/repoTemplateCatalog';
import type { ChecklistTemplate } from '@/types/checklist';

const buildPrivateOrganizationTemplateOfAnotherMember = (overrides: Partial<ChecklistTemplate> = {}): ChecklistTemplate => ({
  id: 'template-1',
  title: 'Launch Checklist',
  sections: [],
  userId: 'creator-1',
  teamId: 'team-1',
  createdAt: '2026-04-18T00:00:00.000Z',
  updatedAt: '2026-04-18T00:00:00.000Z',
  isPublic: false,
  slug: 'launch-checklist',
  version: 1,
  ...overrides,
});

const proBilling: TemplateDetailBillingState = {
  billingEnabled: true,
  isLoading: false,
  isPro: true,
};
const freeBilling: TemplateDetailBillingState = { ...proBilling, isPro: false };

const buildApiClient = (clonePublicTemplate = vi.fn().mockResolvedValue({ id: 'clone-1' })) => ({
  clonePublicTemplate,
  getBillingStatus: vi.fn(),
  getProfileById: vi.fn(),
  getTemplateById: vi.fn(),
  getTemplateBySlug: vi.fn(),
  updateTemplate: vi.fn(),
});

describe('copying a private template', () => {
  it.each([
    ['a Pro user in Personal', proBilling, undefined],
    ['a Free user in Personal', freeBilling, undefined],
    ['a member in another Organization', freeBilling, 'team-2'],
  ])('refuses %s without calling the API or asking for an upgrade', async (_, billingState, teamId) => {
    const apiClient = buildApiClient();
    const createTemplate = vi.fn();

    const result = await saveTemplateToAccount({
      apiClient,
      billingState,
      createTemplate,
      isAuthenticated: true,
      teamId,
      template: buildPrivateOrganizationTemplateOfAnotherMember(),
      userId: 'member-1',
    });

    expect(result).toEqual({ kind: 'error', message: 'Only public templates can be copied.' });
    expect(apiClient.clonePublicTemplate).not.toHaveBeenCalled();
    expect(createTemplate).not.toHaveBeenCalled();
  });

  it('still copies public and library templates', async () => {
    const apiClient = buildApiClient();
    const createTemplate = vi.fn().mockResolvedValue({ id: 'created-1' });

    const publicResult = await saveTemplateToAccount({
      apiClient,
      billingState: proBilling,
      createTemplate,
      isAuthenticated: true,
      template: buildPrivateOrganizationTemplateOfAnotherMember({ isPublic: true }),
      userId: 'member-1',
    });
    const libraryResult = await saveTemplateToAccount({
      apiClient,
      billingState: proBilling,
      createTemplate,
      isAuthenticated: true,
      template: buildPrivateOrganizationTemplateOfAnotherMember({
        id: 'repo:camping',
        isPublic: false,
        teamId: undefined,
        userId: REPO_TEMPLATE_USER_ID,
      }),
      userId: 'member-1',
    });

    expect(publicResult).toEqual({ kind: 'ok', templateId: 'clone-1' });
    expect(libraryResult).toEqual({ kind: 'ok', templateId: 'created-1' });
  });
});

describe('canCopyTemplate', () => {
  it('allows public and library templates only', () => {
    expect(canCopyTemplate(buildPrivateOrganizationTemplateOfAnotherMember())).toBe(false);
    expect(canCopyTemplate(buildPrivateOrganizationTemplateOfAnotherMember({ isPublic: true }))).toBe(true);
    expect(
      canCopyTemplate(buildPrivateOrganizationTemplateOfAnotherMember({ id: 'repo:camping', userId: REPO_TEMPLATE_USER_ID })),
    ).toBe(true);
    expect(canCopyTemplate(null)).toBe(false);
  });
});

describe('getCopyTemplateButton on a private template', () => {
  it('is hidden in Personal and in an Organization, whatever the plan', () => {
    for (const isTeamWorkspace of [false, true]) {
      for (const billingState of [proBilling, freeBilling]) {
        expect(
          getCopyTemplateButton({
            billingState,
            canEditTemplates: true,
            isCloning: false,
            isTeamWorkspace,
            template: buildPrivateOrganizationTemplateOfAnotherMember(),
          }).visible,
        ).toBe(false);
      }
    }
  });
});
