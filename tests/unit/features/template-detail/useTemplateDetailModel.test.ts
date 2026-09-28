import { describe, expect, it, vi } from 'vitest';

import { createApiError } from '@/lib/api-errors';
import { REPO_TEMPLATE_USER_ID } from '@/lib/repoTemplateCatalog';
import type { ChecklistTemplate } from '@/types/checklist';

import {
  countTemplateItems,
  mapApiTemplateToChecklistTemplate,
} from '@/features/template-detail/templateDetailMappers';
import {
  loadTemplateDetailData,
  saveTemplateToAccount,
  startTemplateRun,
  type TemplateDetailBillingState,
} from '@/features/template-detail/useTemplateDetailModel';

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
  isLoading: false,
  isPro: true,
  ...overrides,
});

describe('template detail mappers', () => {
  it('normalizes template payloads into ChecklistTemplate', () => {
    const mapped = mapApiTemplateToChecklistTemplate(
      {
        id: 'template-1',
        title: 'Camping Checklist',
        description: 'Pack the essentials.',
        type: 'recipe',
        items: JSON.stringify([
          {
            id: 'section-1',
            title: 'Prep',
            items: [],
          },
        ]),
        user_id: 'user-1',
        created_at: '2026-04-18T00:00:00.000Z',
        is_public: true,
        category: 'Travel',
        tags: ['camping'],
        owner_username: 'alice',
        owner_full_name: 'Alice Example',
      },
      'fallback-slug',
    );

    expect(mapped).toEqual(
      expect.objectContaining({
        id: 'template-1',
        title: 'Camping Checklist',
        type: 'recipe',
        slug: 'fallback-slug',
        categories: ['Travel'],
        tags: ['camping'],
        isPublic: true,
        ownerProfile: {
          username: 'alice',
          full_name: 'Alice Example',
        },
      }),
    );
    expect(mapped.sections).toEqual([
      {
        id: 'section-1',
        title: 'Prep',
        items: [],
      },
    ]);
  });

  it('wraps legacy flat items into a single checklist section', () => {
    const mapped = mapApiTemplateToChecklistTemplate(
      {
        id: 'legacy-template',
        title: 'Legacy Checklist',
        items: JSON.stringify([
          {
            id: 'item-1',
            title: 'Bring tent',
          },
          {
            id: 'item-2',
            title: 'Pack stove',
          },
        ]),
        user_id: 'user-1',
        created_at: '2026-04-18T00:00:00.000Z',
        is_public: true,
      },
      'legacy-checklist',
    );

    expect(mapped.sections).toEqual([
      {
        id: '1',
        title: 'Checklist',
        items: [
          {
            id: 'item-1',
            title: 'Bring tent',
            isCompleted: false,
            contents: undefined,
          },
          {
            id: 'item-2',
            title: 'Pack stove',
            isCompleted: false,
            contents: undefined,
          },
        ],
      },
    ]);
    expect(countTemplateItems(mapped)).toBe(2);
  });

  const teamRow = {
    id: 'template-t',
    title: 'Organization Checklist',
    sections: [],
    user_id: 'user-b',
    owner_type: 'team',
    team_id: 'team-1',
    created_at: '2026-04-18T00:00:00.000Z',
    is_public: false,
  };

  it('keeps the Organization that owns a template', () => {
    expect(mapApiTemplateToChecklistTemplate(teamRow, 'fallback').teamId).toBe('team-1');
    expect(
      mapApiTemplateToChecklistTemplate(
        { ...teamRow, owner_type: undefined, team_id: undefined, teamId: 'team-2' },
        'fallback',
      ).teamId,
    ).toBe('team-2');
  });

  it('leaves Personal templates without an Organization', () => {
    for (const row of [
      { ...teamRow, owner_type: 'user', team_id: null },
      { ...teamRow, owner_type: 'user', team_id: 'team-1' },
      { ...teamRow, team_id: '' },
    ]) {
      expect(mapApiTemplateToChecklistTemplate(row, 'fallback').teamId).toBeUndefined();
    }
  });
});

describe('loadTemplateDetailData', () => {
  it('falls back to the API and resolves the owner profile', async () => {
    const apiClient = {
      getTemplateById: vi.fn(),
      getTemplateBySlug: vi.fn().mockResolvedValue({
        id: 'template-1',
        title: 'Camping Checklist',
        sections: [],
        user_id: 'user-1',
        created_at: '2026-04-18T00:00:00.000Z',
        updated_at: '2026-04-18T00:00:00.000Z',
        is_public: true,
        slug: 'camping-checklist',
      }),
      getProfileById: vi.fn().mockResolvedValue({
        username: 'alice',
        full_name: 'Alice Example',
      }),
      clonePublicTemplate: vi.fn(),
      updateTemplate: vi.fn(),
    };

    const result = await loadTemplateDetailData(
      {
        mode: 'public',
        identifier: 'camping-checklist',
        ownerUsername: 'alice',
      },
      { apiClient },
    );

    expect(result.notFound).toBe(false);
    expect(result.template?.ownerProfile).toEqual({
      username: 'alice',
      full_name: 'Alice Example',
    });
    expect(apiClient.getTemplateBySlug).toHaveBeenCalledWith(
      'camping-checklist',
    );
    expect(apiClient.getProfileById).toHaveBeenCalledWith('user-1');
  });

  it('normalizes legacy flat items during model loading', async () => {
    const apiClient = {
      getTemplateById: vi.fn(),
      getTemplateBySlug: vi.fn().mockResolvedValue({
        id: 'legacy-template',
        title: 'Legacy Checklist',
        items: JSON.stringify([
          {
            id: 'item-1',
            title: 'Bring tent',
          },
          {
            id: 'item-2',
            title: 'Pack stove',
          },
        ]),
        user_id: 'user-1',
        created_at: '2026-04-18T00:00:00.000Z',
        updated_at: '2026-04-18T00:00:00.000Z',
        is_public: true,
        slug: 'legacy-checklist',
        owner_username: 'alice',
      }),
      getProfileById: vi.fn(),
      clonePublicTemplate: vi.fn(),
      updateTemplate: vi.fn(),
    };

    const result = await loadTemplateDetailData(
      {
        mode: 'public',
        identifier: 'legacy-checklist',
        ownerUsername: 'alice',
      },
      { apiClient },
    );

    expect(result.notFound).toBe(false);
    expect(result.template?.sections).toHaveLength(1);
    expect(result.template?.sections[0]?.items).toHaveLength(2);
    expect(countTemplateItems(result.template as ChecklistTemplate)).toBe(2);
  });

  it('returns notFound when the owner segment does not match', async () => {
    const apiClient = {
      getTemplateById: vi.fn(),
      getTemplateBySlug: vi.fn().mockResolvedValue({
        id: 'template-1',
        title: 'Camping Checklist',
        sections: [],
        user_id: 'user-1',
        created_at: '2026-04-18T00:00:00.000Z',
        updated_at: '2026-04-18T00:00:00.000Z',
        is_public: true,
        slug: 'camping-checklist',
        owner_username: 'bob',
      }),
      getProfileById: vi.fn(),
      clonePublicTemplate: vi.fn(),
      updateTemplate: vi.fn(),
    };

    const result = await loadTemplateDetailData(
      {
        mode: 'public',
        identifier: 'camping-checklist',
        ownerUsername: 'alice',
      },
      { apiClient },
    );

    expect(result).toEqual({ notFound: true, template: null });
  });

  it('keeps the Organization of a private template that is not in the cached list', async () => {
    const apiClient = {
      getTemplateById: vi.fn().mockResolvedValue({
        id: 'template-t',
        title: 'Organization Checklist',
        sections: [],
        user_id: 'user-b',
        owner_type: 'team',
        team_id: 'team-1',
        owner_username: 'bob',
        created_at: '2026-04-18T00:00:00.000Z',
        is_public: false,
      }),
      getTemplateBySlug: vi.fn(),
      getProfileById: vi.fn(),
      clonePublicTemplate: vi.fn(),
      updateTemplate: vi.fn(),
    };

    const result = await loadTemplateDetailData(
      {
        mode: 'private',
        identifier: 'template-t',
        getCachedTemplate: () => undefined,
      },
      { apiClient },
    );

    expect(result.notFound).toBe(false);
    expect(result.template?.teamId).toBe('team-1');
    expect(result.template?.userId).toBe('user-b');
  });
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

  it('returns upgrade_required when a free user tries to save a gated template', async () => {
    const apiClient = {
      getTemplateById: vi.fn(),
      getTemplateBySlug: vi.fn(),
      getProfileById: vi.fn(),
      clonePublicTemplate: vi.fn(),
      updateTemplate: vi.fn(),
    };

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

  it('saves library and API templates into the same Organization', async () => {
    const apiClient = {
      getTemplateById: vi.fn(),
      getTemplateBySlug: vi.fn(),
      getProfileById: vi.fn(),
      clonePublicTemplate: vi.fn().mockResolvedValue({ id: 'clone-1' }),
      updateTemplate: vi.fn(),
    };
    const createTemplate = vi.fn().mockResolvedValue(buildTemplate({ id: 'created-1' }));

    const libraryResult = await saveTemplateToAccount({
      apiClient,
      billingState: buildBillingState(),
      createTemplate,
      isAuthenticated: true,
      teamId: 'team-1',
      template: buildTemplate({ id: 'repo:camping', userId: REPO_TEMPLATE_USER_ID }),
      userId: 'user-1',
    });
    const apiResult = await saveTemplateToAccount({
      apiClient,
      billingState: buildBillingState(),
      createTemplate,
      isAuthenticated: true,
      teamId: 'team-1',
      template: buildTemplate(),
      userId: 'user-1',
    });

    expect(libraryResult).toEqual({ kind: 'ok', templateId: 'created-1' });
    expect(createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'team-1', isPublic: false }),
    );
    expect(apiResult).toEqual({ kind: 'ok', templateId: 'clone-1' });
    expect(apiClient.clonePublicTemplate).toHaveBeenCalledWith('template-1', {
      teamId: 'team-1',
      visibility: 'private',
    });
  });

  it('saves library and API templates into Personal when no Organization is active', async () => {
    const apiClient = {
      getTemplateById: vi.fn(),
      getTemplateBySlug: vi.fn(),
      getProfileById: vi.fn(),
      clonePublicTemplate: vi.fn().mockResolvedValue({ id: 'clone-1' }),
      updateTemplate: vi.fn(),
    };
    const createTemplate = vi.fn().mockResolvedValue(buildTemplate({ id: 'created-1' }));

    await saveTemplateToAccount({
      apiClient,
      billingState: buildBillingState(),
      createTemplate,
      isAuthenticated: true,
      teamId: undefined,
      template: buildTemplate({ id: 'repo:camping', userId: REPO_TEMPLATE_USER_ID }),
      userId: 'user-1',
    });
    await saveTemplateToAccount({
      apiClient,
      billingState: buildBillingState(),
      createTemplate,
      isAuthenticated: true,
      teamId: undefined,
      template: buildTemplate(),
      userId: 'user-1',
    });

    expect(createTemplate.mock.calls[0]?.[0]?.teamId).toBeUndefined();
    expect(apiClient.clonePublicTemplate).toHaveBeenCalledWith('template-1', {
      teamId: undefined,
      visibility: 'private',
    });
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
});
