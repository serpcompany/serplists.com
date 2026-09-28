import { describe, expect, it, vi } from 'vitest';

import { createApiError } from '@/lib/api-errors';
import { REPO_TEMPLATE_USER_ID } from '@/lib/repoTemplateCatalog';
import type { ChecklistTemplate } from '@/types/checklist';

import { shareTemplateToPublic } from '@/features/template-detail/useTemplateDetailModel';

const ORIGIN = 'https://serplists.com';

const buildTemplate = (
  overrides: Partial<ChecklistTemplate> = {},
): ChecklistTemplate => ({
  id: 'template-1',
  title: 'Camping Checklist',
  description: '',
  sections: [],
  userId: 'user-1',
  createdAt: '2026-04-18T00:00:00.000Z',
  updatedAt: '2026-04-18T00:00:00.000Z',
  isPublic: false,
  slug: 'camping-checklist',
  categories: [],
  tags: [],
  version: 3,
  ...overrides,
});

const buildApiClient = (profile: Record<string, unknown> | Error = { username: null }) => ({
  clonePublicTemplate: vi.fn(),
  getBillingStatus: vi.fn(),
  getProfileById:
    profile instanceof Error
      ? vi.fn().mockRejectedValue(profile)
      : vi.fn().mockResolvedValue(profile),
  getTemplateById: vi.fn(),
  getTemplateBySlug: vi.fn(),
  updateTemplate: vi.fn().mockResolvedValue({}),
});

describe('shareTemplateToPublic', () => {
  it('leaves a private template private when the owner has no username', async () => {
    const apiClient = buildApiClient({ username: null, full_name: 'New User' });
    const onTemplateChange = vi.fn();
    const invalidateTemplates = vi.fn();

    const result = await shareTemplateToPublic({
      apiClient,
      invalidateTemplates,
      isAuthenticated: true,
      onTemplateChange,
      origin: ORIGIN,
      template: buildTemplate(),
      userId: 'user-1',
      username: undefined,
    });

    expect(result).toEqual({
      kind: 'error',
      message:
        'Set a username on your account before sharing templates with the canonical public URL.',
    });
    expect(apiClient.updateTemplate).not.toHaveBeenCalled();
    expect(onTemplateChange).not.toHaveBeenCalled();
    expect(invalidateTemplates).not.toHaveBeenCalled();
  });

  it('changes nothing when the owner profile cannot be loaded', async () => {
    const apiClient = buildApiClient(new Error('network down'));

    const result = await shareTemplateToPublic({
      apiClient,
      isAuthenticated: true,
      onTemplateChange: vi.fn(),
      origin: ORIGIN,
      template: buildTemplate(),
      userId: 'user-1',
      username: undefined,
    });

    expect(result.kind).toBe('error');
    expect(apiClient.updateTemplate).not.toHaveBeenCalled();
  });

  it('publishes once, updates local state and refreshes lists when the owner has a username', async () => {
    const apiClient = buildApiClient({ username: 'alice' });
    const onTemplateChange = vi.fn();
    const invalidateTemplates = vi.fn();

    const result = await shareTemplateToPublic({
      apiClient,
      invalidateTemplates,
      isAuthenticated: true,
      onTemplateChange,
      origin: ORIGIN,
      template: buildTemplate(),
      userId: 'user-1',
      username: undefined,
    });

    expect(result).toEqual({
      kind: 'ok',
      shareUrl: `${ORIGIN}/profile/alice/camping-checklist`,
    });
    expect(apiClient.updateTemplate).toHaveBeenCalledTimes(1);
    expect(apiClient.updateTemplate).toHaveBeenCalledWith('template-1', {
      is_public: true,
      expected_version: 3,
    });
    expect(onTemplateChange).toHaveBeenCalledWith(
      expect.objectContaining({ isPublic: true }),
    );
    expect(invalidateTemplates).toHaveBeenCalledTimes(1);
  });

  it('uses the signed-in username when the profile has none yet', async () => {
    const apiClient = buildApiClient({ username: null });

    const result = await shareTemplateToPublic({
      apiClient,
      isAuthenticated: true,
      onTemplateChange: vi.fn(),
      origin: ORIGIN,
      template: buildTemplate(),
      userId: 'user-1',
      username: 'alice',
    });

    expect(result).toEqual({
      kind: 'ok',
      shareUrl: `${ORIGIN}/profile/alice/camping-checklist`,
    });
    expect(apiClient.updateTemplate).toHaveBeenCalledTimes(1);
  });

  it('keeps local state public when refreshing the lists fails after publishing', async () => {
    const apiClient = buildApiClient({ username: 'alice' });
    const onTemplateChange = vi.fn();

    const result = await shareTemplateToPublic({
      apiClient,
      invalidateTemplates: vi.fn().mockRejectedValue(new Error('refetch failed')),
      isAuthenticated: true,
      onTemplateChange,
      origin: ORIGIN,
      template: buildTemplate(),
      userId: 'user-1',
      username: undefined,
    });

    expect(result.kind).toBe('ok');
    expect(onTemplateChange).toHaveBeenCalledWith(
      expect.objectContaining({ isPublic: true }),
    );
  });

  it('does not publish again when the template is already public', async () => {
    const apiClient = buildApiClient({ username: 'alice' });

    const result = await shareTemplateToPublic({
      apiClient,
      isAuthenticated: true,
      onTemplateChange: vi.fn(),
      origin: ORIGIN,
      template: buildTemplate({ isPublic: true }),
      userId: 'user-1',
      username: undefined,
    });

    expect(result.kind).toBe('ok');
    expect(apiClient.updateTemplate).not.toHaveBeenCalled();
  });

  it('publishes when the page shows the template as private even if the loaded copy says public', async () => {
    const apiClient = buildApiClient({ username: 'alice' });

    await shareTemplateToPublic({
      apiClient,
      isAuthenticated: true,
      isPublic: false,
      onTemplateChange: vi.fn(),
      origin: ORIGIN,
      template: buildTemplate({ isPublic: true }),
      userId: 'user-1',
      username: undefined,
    });

    expect(apiClient.updateTemplate).toHaveBeenCalledTimes(1);
  });

  it('shares library templates without a username', async () => {
    const apiClient = buildApiClient();

    const result = await shareTemplateToPublic({
      apiClient,
      isAuthenticated: true,
      onTemplateChange: vi.fn(),
      origin: ORIGIN,
      template: buildTemplate({
        id: 'repo:camping-checklist',
        isPublic: true,
        userId: REPO_TEMPLATE_USER_ID,
      }),
      userId: REPO_TEMPLATE_USER_ID,
      username: undefined,
    });

    expect(result).toEqual({
      kind: 'ok',
      shareUrl: `${ORIGIN}/profile/serp/camping-checklist`,
    });
  });

  it('refuses templates the user does not own and leaves them unchanged', async () => {
    const apiClient = buildApiClient({ username: 'alice' });

    const result = await shareTemplateToPublic({
      apiClient,
      isAuthenticated: true,
      onTemplateChange: vi.fn(),
      origin: ORIGIN,
      template: buildTemplate({ userId: 'someone-else' }),
      userId: 'user-1',
      username: 'alice',
    });

    expect(result).toEqual({
      kind: 'error',
      message: 'You can only share templates you own.',
    });
    expect(apiClient.updateTemplate).not.toHaveBeenCalled();
  });

  it('keeps local state unchanged when the visibility change is rejected', async () => {
    const apiClient = buildApiClient({ username: 'alice' });
    apiClient.updateTemplate.mockRejectedValue(
      createApiError(409, { code: 'edit_conflict', error: 'Template changed' }),
    );
    const onTemplateChange = vi.fn();

    const result = await shareTemplateToPublic({
      apiClient,
      isAuthenticated: true,
      onTemplateChange,
      origin: ORIGIN,
      template: buildTemplate(),
      userId: 'user-1',
      username: undefined,
    });

    expect(result).toEqual({ kind: 'error', message: 'Template changed' });
    expect(onTemplateChange).not.toHaveBeenCalled();
  });
});
