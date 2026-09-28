import { describe, expect, it, vi } from 'vitest';

import { createApiError } from '@/lib/api-errors';
import type { ChecklistTemplate } from '@/types/checklist';

import {
  countTemplateItems,
  mapApiTemplateToChecklistTemplate,
} from '@/features/template-detail/templateDetailMappers';
import {
  loadTemplateDetailData,
  saveTemplateToAccount,
  startTemplateRun,
  updateTemplateVisibility,
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

  it('keeps the owner type, which public responses send instead of team_id', () => {
    const base = { id: 'template-1', title: 'Plan', sections: [], user_id: 'user-1', is_public: true };

    expect(mapApiTemplateToChecklistTemplate({ ...base, owner_type: 'team' }, 'plan').ownerType).toBe('team');
    expect(mapApiTemplateToChecklistTemplate({ ...base, owner_type: 'user' }, 'plan').ownerType).toBe('user');
    expect(mapApiTemplateToChecklistTemplate(base, 'plan').ownerType).toBeUndefined();
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
});

describe('loadTemplateDetailData', () => {
  it('loads a public template from cached data first', async () => {
    const cachedTemplate = buildTemplate({
      ownerProfile: { username: 'alice' },
    });
    const apiClient = {
      getTemplateById: vi.fn(),
      getTemplateBySlug: vi.fn(),
      getProfileById: vi.fn(),
      clonePublicTemplate: vi.fn(),
      updateTemplate: vi.fn(),
    };

    const result = await loadTemplateDetailData(
      {
        mode: 'public',
        identifier: 'camping-checklist',
        ownerUsername: 'alice',
        cachedTemplates: [cachedTemplate],
      },
      { apiClient },
    );

    expect(result).toEqual({ notFound: false, template: cachedTemplate });
    expect(apiClient.getTemplateById).not.toHaveBeenCalled();
    expect(apiClient.getTemplateBySlug).not.toHaveBeenCalled();
  });

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
        cachedTemplates: [],
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
        cachedTemplates: [],
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
        cachedTemplates: [],
      },
      { apiClient },
    );

    expect(result).toEqual({ notFound: true, template: null });
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

describe('updateTemplateVisibility', () => {
  it('sends only the visibility flag and version guard, never the template content', async () => {
    const apiClient = { updateTemplate: vi.fn().mockResolvedValue({ success: true, version: 4 }) };
    const template = buildTemplate({ isPublic: false, version: 4 });

    const next = await updateTemplateVisibility({ apiClient, isPublic: true, template });

    expect(apiClient.updateTemplate).toHaveBeenCalledTimes(1);
    expect(apiClient.updateTemplate.mock.calls[0]).toEqual(['template-1', { is_public: true, expected_version: 4 }]);
    expect(next).toEqual({ ...template, isPublic: true, version: 4 });
  });

  it('keeps the next toggle on the version the server returned', async () => {
    const apiClient = { updateTemplate: vi.fn().mockResolvedValue({ success: true, version: 7 }) };

    const next = await updateTemplateVisibility({ apiClient, isPublic: false, template: buildTemplate({ version: 6 }) });

    expect(next.version).toBe(7);
    expect(next.isPublic).toBe(false);
  });
});
