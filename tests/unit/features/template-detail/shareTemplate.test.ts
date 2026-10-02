import { describe, expect, it, vi } from 'vitest';

import { createApiError } from '@/lib/api-errors';
import { REPO_TEMPLATE_USER_ID } from '@/lib/repoTemplateCatalog';
import type { ChecklistTemplate } from '@/types/checklist';

import { shareTemplateToPublic } from '@/features/template-detail/shareTemplate';
import { setTemplateVisibility } from '@/features/template-detail/templateVisibility';

import { templateDetailApiClient } from '../../../fixtures/templateDetailApiClient';
import type { TemplateUpdater } from '@/features/template-detail/useTemplateDetailRecord';
import { present } from '../../../support/elements';

const ORIGIN = 'https://serplists.com';
const SHARED_AT_ALICES_LINK = { kind: 'ok', shareUrl: `${ORIGIN}/profile/alice/camping-checklist/` };
const editConflict = () => createApiError(409, { code: 'edit_conflict', error: 'Template changed' });

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

const buildApiClient = (profile: Record<string, unknown> | Error = { username: null }) =>
  templateDetailApiClient({
    getProfileById: profile instanceof Error ? vi.fn().mockRejectedValue(profile) : vi.fn().mockResolvedValue(profile),
    updateTemplate: vi.fn().mockResolvedValue({}),
  });

const aShareThatConflicts = () => {
  const apiClient = buildApiClient({ username: 'alice' });
  apiClient.updateTemplate.mockRejectedValue(editConflict());
  return { apiClient, reloadAfterConflict: vi.fn().mockResolvedValue(undefined), onTemplateChange: vi.fn() };
};

const share = (
  apiClient: ReturnType<typeof buildApiClient>,
  options: Partial<Parameters<typeof shareTemplateToPublic>[0]> = {},
) =>
  shareTemplateToPublic({
    apiClient,
    canShare: true,
    isAuthenticated: true,
    onTemplateChange: vi.fn(),
    origin: ORIGIN,
    template: buildTemplate(),
    userId: 'user-1',
    username: undefined,
    ...options,
  });

describe('shareTemplateToPublic', () => {
  it('leaves a private template private when the owner has no username', async () => {
    const apiClient = buildApiClient({ username: null, full_name: 'New User' });
    const onTemplateChange = vi.fn();
    const invalidateTemplates = vi.fn();

    const result = await share(apiClient, { invalidateTemplates, onTemplateChange });

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

    const result = await share(apiClient);

    expect(result.kind).toBe('error');
    expect(apiClient.updateTemplate).not.toHaveBeenCalled();
  });

  it('publishes once, updates local state and refreshes lists when the owner has a username', async () => {
    const apiClient = buildApiClient({ username: 'alice' });
    const onTemplateChange = vi.fn();
    const invalidateTemplates = vi.fn();

    const result = await share(apiClient, { invalidateTemplates, onTemplateChange });

    expect(result).toEqual(SHARED_AT_ALICES_LINK);
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

    const result = await share(apiClient, { username: 'alice' });

    expect(result).toEqual(SHARED_AT_ALICES_LINK);
    expect(apiClient.updateTemplate).toHaveBeenCalledTimes(1);
  });

  it('keeps local state public when refreshing the lists fails after publishing', async () => {
    const apiClient = buildApiClient({ username: 'alice' });
    const onTemplateChange = vi.fn();

    const result = await share(apiClient, {
      invalidateTemplates: vi.fn().mockRejectedValue(new Error('refetch failed')),
      onTemplateChange,
    });

    expect(result.kind).toBe('ok');
    expect(onTemplateChange).toHaveBeenCalledWith(
      expect.objectContaining({ isPublic: true }),
    );
  });

  it('asks the server to confirm a template the loaded copy shows as public, which stores nothing when it is still public', async () => {
    const apiClient = buildApiClient({ username: 'alice' });
    apiClient.updateTemplate.mockResolvedValue({ version: 3, slug: 'camping-checklist' });

    const result = await share(apiClient, { template: buildTemplate({ isPublic: true }) });

    expect(result).toEqual(SHARED_AT_ALICES_LINK);
    expect(apiClient.updateTemplate).toHaveBeenCalledTimes(1);
    expect(apiClient.updateTemplate).toHaveBeenCalledWith('template-1', {
      is_public: true,
      expected_version: 3,
    });
  });

  it('gives no link when a public copy went private or was re-slugged elsewhere', async () => {
    const { apiClient, reloadAfterConflict, onTemplateChange } = aShareThatConflicts();
    const invalidateTemplates = vi.fn();

    const result = await share(apiClient, {
      invalidateTemplates,
      onTemplateChange,
      reloadAfterConflict,
      template: buildTemplate({ isPublic: true, slug: 'old', version: 5 }),
    });

    expect(apiClient.updateTemplate).toHaveBeenCalledWith('template-1', {
      is_public: true,
      expected_version: 5,
    });
    expect(reloadAfterConflict).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      kind: 'error',
      message: 'This template changed elsewhere. It was reloaded; try again.',
    });
    expect(onTemplateChange).not.toHaveBeenCalled();
    expect(invalidateTemplates).not.toHaveBeenCalled();
  });

  it('gives no link when a public copy was archived elsewhere', async () => {
    const apiClient = buildApiClient({ username: 'alice' });
    apiClient.updateTemplate.mockRejectedValue(
      createApiError(404, { error: 'Template not found or unauthorized' }),
    );
    const reloadAfterConflict = vi.fn().mockResolvedValue(undefined);
    const onTemplateChange = vi.fn();

    const result = await share(apiClient, {
      onTemplateChange,
      reloadAfterConflict,
      template: buildTemplate({ isPublic: true }),
    });

    expect(reloadAfterConflict).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ kind: 'error', message: 'This template is no longer available.' });
    expect(onTemplateChange).not.toHaveBeenCalled();
  });

  it('builds the link from the slug the server returns', async () => {
    const apiClient = buildApiClient({ username: 'alice' });
    apiClient.updateTemplate.mockResolvedValue({ version: 5, slug: 'new' });
    const onTemplateChange = vi.fn();

    const result = await share(apiClient, {
      onTemplateChange,
      template: buildTemplate({ isPublic: true, slug: 'old', version: 5 }),
    });

    expect(result).toEqual({ kind: 'ok', shareUrl: `${ORIGIN}/profile/alice/new/` });
    expect(onTemplateChange).toHaveBeenCalledWith(
      expect.objectContaining({ isPublic: true, slug: 'new', version: 5 }),
    );
  });

  it("looks up the Creator's current username when someone else shares their template", async () => {
    const apiClient = buildApiClient({ username: 'alicejones' });

    const result = await share(apiClient, {
      template: buildTemplate({
        isPublic: true,
        ownerProfile: { username: 'alice' },
        teamId: 'team-1',
        userId: 'alice-id',
      }),
      userId: 'bob-id',
      username: 'bob',
    });

    expect(apiClient.getProfileById).toHaveBeenCalledWith('alice-id');
    expect(result).toEqual({
      kind: 'ok',
      shareUrl: `${ORIGIN}/profile/alicejones/camping-checklist/`,
    });
  });

  it('publishes again after the switch made the template private, with a version the server accepts', async () => {
    const apiClient = buildApiClient({ username: 'alice' });
    const shown = buildTemplate({ isPublic: true });
    const onVisibilityChange = vi.fn<(update: TemplateUpdater) => void>();
    await setTemplateVisibility({
      apiClient,
      canEdit: true,
      isPublic: false,
      onTemplateChange: onVisibilityChange,
      template: shown,
    });
    const afterSwitch = present(present(onVisibilityChange.mock.calls[0], 'the visibility update')[0](shown), 'the template after the switch');
    const onShare = vi.fn();

    const result = await share(apiClient, { onTemplateChange: onShare, template: afterSwitch });

    expect(result.kind).toBe('ok');
    expect(apiClient.updateTemplate).toHaveBeenLastCalledWith('template-1', {
      is_public: true,
      expected_version: 3,
    });
    expect(onShare).toHaveBeenCalledWith(expect.objectContaining({ isPublic: true, version: 3 }));
  });

  it('shares library templates without a username or a request, since they are not stored rows', async () => {
    const apiClient = buildApiClient();

    const result = await share(apiClient, {
      template: buildTemplate({
        id: 'repo:camping-checklist',
        isPublic: true,
        userId: REPO_TEMPLATE_USER_ID,
      }),
      userId: REPO_TEMPLATE_USER_ID,
    });

    expect(result).toEqual({
      kind: 'ok',
      shareUrl: `${ORIGIN}/profile/serp/camping-checklist/`,
    });
    expect(apiClient.updateTemplate).not.toHaveBeenCalled();
  });

  it('refuses when the viewer may not share the template and leaves it unchanged', async () => {
    const apiClient = buildApiClient({ username: 'alice' });

    const result = await share(apiClient, {
      canShare: false,
      template: buildTemplate({ userId: 'someone-else' }),
      username: 'alice',
    });

    expect(result).toEqual({
      kind: 'error',
      message: 'You can only share templates you own.',
    });
    expect(apiClient.updateTemplate).not.toHaveBeenCalled();
  });

  it('lets an Organization editor share a template someone else created', async () => {
    const apiClient = buildApiClient({ username: 'alice' });

    const result = await share(apiClient, {
      template: buildTemplate({ teamId: 'team-1', userId: 'alice-id' }),
      userId: 'bob-id',
      username: 'bob',
    });

    expect(result).toEqual(SHARED_AT_ALICES_LINK);
    expect(apiClient.getProfileById).toHaveBeenCalledWith('alice-id');
    expect(apiClient.updateTemplate).toHaveBeenCalledTimes(1);
  });

  it("never builds the link from the sharer's username for a template someone else created", async () => {
    const apiClient = buildApiClient({ username: null });

    const result = await share(apiClient, {
      template: buildTemplate({ teamId: 'team-1', userId: 'alice-id' }),
      userId: 'bob-id',
      username: 'bob',
    });

    expect(result).toEqual({
      kind: 'error',
      message: 'Failed to create a share link for this template.',
    });
    expect(apiClient.updateTemplate).not.toHaveBeenCalled();
  });

  it('keeps local state unchanged when the visibility change is rejected', async () => {
    const apiClient = buildApiClient({ username: 'alice' });
    apiClient.updateTemplate.mockRejectedValue(editConflict());
    const onTemplateChange = vi.fn();

    const result = await share(apiClient, { onTemplateChange });

    expect(result).toEqual({ kind: 'error', message: 'Template changed' });
    expect(onTemplateChange).not.toHaveBeenCalled();
  });

  it('reloads the stored template after an edit conflict so a retry can succeed', async () => {
    const { apiClient, reloadAfterConflict, onTemplateChange } = aShareThatConflicts();

    const result = await share(apiClient, { onTemplateChange, reloadAfterConflict });

    expect(reloadAfterConflict).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      kind: 'error',
      message: 'This template changed elsewhere. It was reloaded; try again.',
    });
    expect(onTemplateChange).not.toHaveBeenCalled();
  });

  it('keeps the version the server stored when Share makes the template public', async () => {
    const apiClient = buildApiClient({ username: 'alice' });
    apiClient.updateTemplate.mockResolvedValue({ version: 4, slug: 'camping-checklist' });
    const onTemplateChange = vi.fn();

    await share(apiClient, { onTemplateChange });

    expect(onTemplateChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'template-1', isPublic: true, version: 4 }),
    );
  });
});
