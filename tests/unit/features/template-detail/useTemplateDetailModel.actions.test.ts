import { describe, expect, it, vi, type Mock } from 'vitest';
import { elementAt, firstOf } from '../../../support/elements';

import { createApiError } from '@/lib/api-errors';
import { REPO_TEMPLATE_USER_ID } from '@/lib/repoTemplateCatalog';
import type { ChecklistTemplate } from '@/types/checklist';

import { buildCanonicalPublicTemplatePath } from '@/lib/routes';
import {
  buildCopiedTemplatePath,
  duplicateOwnedTemplate,
  saveTemplateToAccount,
  startTemplateRun,
} from '@/features/template-detail/templateActionOutcome';
import { resolveShareOwnerTemplate } from '@/features/template-detail/templateDetailApi';
import type { TemplateDetailBillingState } from '@/features/template-detail/useTemplateDetailModel';
import { setTemplateVisibility } from '@/features/template-detail/templateVisibility';
import type { TemplateUpdater } from '@/features/template-detail/useTemplateDetailRecord';

import { apiClientThatClones, templateDetailApiClient } from '../../../fixtures/templateDetailApiClient';
import type { CreateTemplate } from '@/features/template-detail/templateActionOutcome';

const buildTemplate = (
  overrides: Partial<ChecklistTemplate> = {},
): ChecklistTemplate => ({
  id: 'template-1',
  title: 'Camping Checklist',
  description: 'Pack the essentials.',
  sections: [],
  userId: 'user-1',
  createdAt: '2026-04-18T00:00:00.000Z',
  updatedAt: '2026-04-18T00:00:00.000Z',
  isPublic: true,
  slug: 'camping-checklist',
  categories: ['Travel'],
  tags: ['camping'],
  version: 1,
  ...overrides,
});

const buildBillingState = (
  overrides: Partial<TemplateDetailBillingState> = {},
): TemplateDetailBillingState => ({
  billingEnabled: true,
  isError: false,
  isLoading: false,
  isPro: true,
  ...overrides,
});

describe('template detail actions', () => {
  it('returns login_required when a signed-out user starts a run', async () => {
    const result = await startTemplateRun({
      createRun: vi.fn(),
      isAuthenticated: false,
      template: buildTemplate(),
      runName: 'Trip Run',
    });

    expect(result).toEqual({ kind: 'login_required' });
  });

  it('returns the Organization that owns a started run, or none for a Personal run, so the page opens it in its context', async () => {
    const startIn = (teamId: string | undefined) =>
      startTemplateRun({
        createRun: vi.fn().mockResolvedValue({ id: 'run-1', teamId }),
        isAuthenticated: true,
        template: buildTemplate(),
      });

    expect(await startIn('team-b')).toStrictEqual({ kind: 'ok', runId: 'run-1', teamId: 'team-b' });
    expect(await startIn(undefined)).toStrictEqual({ kind: 'ok', runId: 'run-1', teamId: undefined });
  });

  it("opens a copy, or the Templates it went to, in its owner's context", () => {
    expect(buildCopiedTemplatePath({ kind: 'ok', templateId: 'copy-1', teamId: 'team-b' })).toBe(
      '/dashboard/organization/team-b/templates/copy-1/',
    );
    expect(buildCopiedTemplatePath({ kind: 'ok', templateId: 'copy-1' })).toBe('/dashboard/templates/copy-1/');
    expect(buildCopiedTemplatePath({ kind: 'ok', teamId: 'team-b' })).toBe('/dashboard/organization/team-b/templates/');
  });

  it('returns the Organization that owns a duplicate', async () => {
    const result = await duplicateOwnedTemplate({
      activeTeamId: 'team-a',
      createTemplate: vi.fn().mockResolvedValue(buildTemplate({ id: 'copy-3', isPublic: false, teamId: 'team-b' })),
      template: buildTemplate({ isPublic: false, teamId: 'team-b' }),
    });

    expect(result).toStrictEqual({ kind: 'ok', templateId: 'copy-3', teamId: 'team-b' });
  });

  it('returns upgrade_required when a free user tries to save a gated template', async () => {
    const apiClient = templateDetailApiClient();

    const result = await saveTemplateToAccount(
      {
        apiClient,
        billingState: buildBillingState({ isPro: false }),
        createTemplate: vi.fn(),
        invalidateTemplates: vi.fn(),
        isAuthenticated: true,
        template: buildTemplate(),
        userId: 'user-1',
      },
    );

    expect(result).toEqual({ kind: 'upgrade_required' });
    expect(apiClient.clonePublicTemplate).not.toHaveBeenCalled();
  });

  const saveALibraryAndAnApiTemplateInto = async (teamId: string | undefined) => {
    const apiClient = apiClientThatClones();
    const createTemplate = vi.fn<CreateTemplate>().mockResolvedValue(buildTemplate({ id: 'created-1' }));
    const save = (template: ChecklistTemplate) =>
      saveTemplateToAccount({
        apiClient,
        billingState: buildBillingState(),
        createTemplate,
        isAuthenticated: true,
        teamId,
        template,
        userId: 'user-1',
      });
    const libraryResult = await save(buildTemplate({ id: 'repo:camping', userId: REPO_TEMPLATE_USER_ID }));
    const apiResult = await save(buildTemplate());
    return { apiClient, createTemplate, libraryResult, apiResult };
  };

  it('saves library and API templates into the same Organization', async () => {
    const { apiClient, createTemplate, libraryResult, apiResult } = await saveALibraryAndAnApiTemplateInto('team-1');

    expect(libraryResult).toEqual({ kind: 'ok', templateId: 'created-1' });
    expect(createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'team-1', isPublic: false }),
    );
    expect(apiResult).toEqual({ kind: 'ok', templateId: 'clone-1', teamId: 'team-1' });
    expect(apiClient.clonePublicTemplate).toHaveBeenCalledWith('template-1', {
      teamId: 'team-1',
      visibility: 'private',
    });
  });

  it('saves library and API templates into Personal when no Organization is active', async () => {
    const { apiClient, createTemplate } = await saveALibraryAndAnApiTemplateInto(undefined);

    expect(createTemplate.mock.calls[0]?.[0]?.teamId).toBeUndefined();
    expect(apiClient.clonePublicTemplate).toHaveBeenCalledWith('template-1', {
      teamId: undefined,
      visibility: 'private',
    });
  });

  it('does not send a user to checkout when the plan could not be checked', async () => {
    const apiClient = templateDetailApiClient();
    const createTemplate = vi.fn();

    const result = await saveTemplateToAccount({
      apiClient,
      billingState: buildBillingState({ isError: true, isPro: false }),
      createTemplate,
      invalidateTemplates: vi.fn(),
      isAuthenticated: true,
      teamId: undefined,
      template: buildTemplate(),
      userId: 'user-1',
    });

    expect(result).toEqual({
      kind: 'error',
      message: "Couldn't check your plan. Try again.",
    });
    expect(apiClient.clonePublicTemplate).not.toHaveBeenCalled();
    expect(createTemplate).not.toHaveBeenCalled();
  });

  it('maps access failures into typed action results', async () => {
    const result = await startTemplateRun({
      createRun: vi
        .fn()
        .mockRejectedValue(
          createApiError(403, {
            code: 'upgrade_required',
            error: 'Upgrade to copy template',
          }),
        ),
      isAuthenticated: true,
      template: buildTemplate(),
      runName: 'Trip Run',
    });

    expect(result).toEqual({ kind: 'upgrade_required' });
  });

  it('maps a plan limit on Duplicate to upgrade_required, as for Start Run, since free Personal allows one template', async () => {
    const createTemplate = vi.fn().mockRejectedValue(
      createApiError(403, {
        code: 'limit_reached',
        error: 'Template limit reached. Upgrade to create more templates.',
      }),
    );

    const result = await duplicateOwnedTemplate({
      createTemplate,
      template: buildTemplate({ rules: [], seoTitle: 'SEO', seoDescription: 'Desc' }),
    });

    expect(result).toEqual({ kind: 'upgrade_required' });
  });

  it('duplicates a template as a copy with a fresh slug', async () => {
    const createTemplate = vi.fn().mockResolvedValue(buildTemplate({ id: 'copy-1' }));

    const result = await duplicateOwnedTemplate({
      createTemplate,
      template: buildTemplate(),
    });

    expect(result).toEqual({ kind: 'ok', templateId: 'copy-1' });
    expect(createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Camping Checklist Copy', seoUrl: '' }),
    );
  });

  it('duplicates a private template of Organization B opened from Organization A into B, and a public one into A', async () => {
    const createTemplate = vi.fn().mockResolvedValue(buildTemplate({ id: 'copy-2' }));

    await duplicateOwnedTemplate({
      activeTeamId: 'team-a',
      createTemplate,
      template: buildTemplate({ isPublic: false, teamId: 'team-b' }),
    });
    await duplicateOwnedTemplate({
      activeTeamId: 'team-a',
      createTemplate,
      template: buildTemplate({ isPublic: true, teamId: 'team-b' }),
    });

    expect(firstOf(createTemplate.mock.calls)[0]).toMatchObject({ teamId: 'team-b' });
    expect(elementAt(createTemplate.mock.calls, 1)[0]).toMatchObject({ teamId: 'team-a' });
  });
  it('returns an error, not upgrade_required, when an Organization limit blocks a run', async () => {
    const message =
      'Active run limit reached. This Organization needs a paid plan to create more checklist runs.';
    const result = await startTemplateRun({
      createRun: vi.fn().mockRejectedValue(
        createApiError(403, {
          code: 'limit_reached',
          error: message,
          details: { limit: 1, current: 1, resource: 'active_runs', context: 'organization' },
        }),
      ),
      isAuthenticated: true,
      template: buildTemplate(),
      runName: 'Trip Run',
    });

    expect(result).toEqual({ kind: 'error', message });
  });

  it('still returns upgrade_required when a Personal limit blocks a run', async () => {
    const result = await startTemplateRun({
      createRun: vi.fn().mockRejectedValue(
        createApiError(403, {
          code: 'limit_reached',
          error: 'Active run limit reached. Upgrade to Pro to create more checklist runs.',
          details: { limit: 1, current: 1, resource: 'active_runs', context: 'personal' },
        }),
      ),
      isAuthenticated: true,
      template: buildTemplate(),
      runName: 'Trip Run',
    });

    expect(result).toEqual({ kind: 'upgrade_required' });
  });

  it('returns an error when an Organization template limit blocks a save', async () => {
    const message =
      'Template limit reached. This Organization needs a paid plan to create more templates.';
    const apiClient = templateDetailApiClient({
      clonePublicTemplate: vi.fn().mockRejectedValue(
        createApiError(403, {
          code: 'limit_reached',
          error: message,
          details: { limit: 3, current: 3, resource: 'templates', context: 'organization' },
        }),
      ),
    });

    const result = await saveTemplateToAccount({
      apiClient,
      billingState: buildBillingState(),
      createTemplate: vi.fn(),
      isAuthenticated: true,
      teamId: 'team-1',
      template: buildTemplate(),
      userId: 'user-1',
    });

    expect(result).toEqual({ kind: 'error', message });
  });
});

describe("resolveShareOwnerTemplate, since cached template lists keep the owner's username from before a rename", () => {
  const renamedOwner = { userId: 'user-1', username: 'alicejones' };

  it("uses the signed-in owner's current username over a cached one", async () => {
    const apiClient = { getProfileById: vi.fn() };
    const template = buildTemplate({
      slug: 'seo-audit',
      ownerProfile: { username: 'alice', full_name: 'Alice' },
    });

    const shared = await resolveShareOwnerTemplate(template, renamedOwner, apiClient);

    expect(buildCanonicalPublicTemplatePath(shared)).toBe('/profile/alicejones/seo-audit/');
    expect(shared.ownerProfile?.full_name).toBe('Alice');
    expect(apiClient.getProfileById).not.toHaveBeenCalled();
  });

  it('looks the owner up when the session has no username', async () => {
    const apiClient = { getProfileById: vi.fn().mockResolvedValue({ username: 'alicejones' }) };
    const template = buildTemplate({ slug: 'seo-audit', ownerProfile: undefined });

    const shared = await resolveShareOwnerTemplate(template, { userId: 'user-1' }, apiClient);

    expect(apiClient.getProfileById).toHaveBeenCalledWith('user-1');
    expect(buildCanonicalPublicTemplatePath(shared)).toBe('/profile/alicejones/seo-audit/');
  });

  it("never puts the signed-in user's name on someone else's template", async () => {
    const apiClient = { getProfileById: vi.fn() };
    const template = buildTemplate({
      slug: 'seo-audit',
      userId: 'user-2',
      ownerProfile: { username: 'bob' },
    });

    const shared = await resolveShareOwnerTemplate(template, renamedOwner, apiClient);

    expect(buildCanonicalPublicTemplatePath(shared)).toBe('/profile/bob/seo-audit/');
  });
});

describe('setTemplateVisibility', () => {
  const visibilityClient = (updateTemplate: Mock) => templateDetailApiClient({ updateTemplate });
  const applyChange = (onTemplateChange: Mock<(update: TemplateUpdater) => void>, current: ChecklistTemplate) =>
    firstOf(onTemplateChange.mock.calls)[0](current);

  it('sends only the visibility flag and version guard, never the template content', async () => {
    const apiClient = visibilityClient(vi.fn().mockResolvedValue({ version: 4 }));
    const onTemplateChange = vi.fn<(update: TemplateUpdater) => void>();
    const template = buildTemplate({ isPublic: false, version: 4 });

    await setTemplateVisibility({ apiClient, canEdit: true, isPublic: true, onTemplateChange, template });

    expect(apiClient.updateTemplate).toHaveBeenCalledTimes(1);
    expect(apiClient.updateTemplate.mock.calls[0]).toEqual(['template-1', { is_public: true, expected_version: 4 }]);
    expect(applyChange(onTemplateChange, template)).toEqual({ ...template, isPublic: true, version: 4 });
  });

  it('keeps the next toggle on the version the server returned', async () => {
    const apiClient = visibilityClient(vi.fn().mockResolvedValue({ version: 7 }));
    const onTemplateChange = vi.fn<(update: TemplateUpdater) => void>();
    const template = buildTemplate({ version: 6 });

    await setTemplateVisibility({ apiClient, canEdit: true, isPublic: false, onTemplateChange, template });

    const next = applyChange(onTemplateChange, template);
    expect(next?.version).toBe(7);
    expect(next?.isPublic).toBe(false);
  });
});
