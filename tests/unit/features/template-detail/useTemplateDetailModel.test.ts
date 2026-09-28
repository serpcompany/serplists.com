import { describe, expect, it, vi } from 'vitest';

import { createApiError } from '@/lib/api-errors';
import type { ChecklistTemplate } from '@/types/checklist';

import {
  countTemplateItems,
  mapApiTemplateToChecklistTemplate,
} from '@/features/template-detail/templateDetailMappers';
import { buildCanonicalPublicTemplatePath } from '@/lib/routes';
import {
  loadTemplateDetailData,
  resolveShareOwnerTemplate,
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

    expect(result).toEqual({ loadError: false, notFound: false, template: cachedTemplate });
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

    expect(result).toEqual({ loadError: false, notFound: true, template: null });
  });

  // Only a settled 404 may render the noindex "Template not found" state. A failure that can
  // be transient must not tell crawlers that a real public template is gone.
  const failingLookup = (error: unknown) => ({
    getTemplateById: vi.fn().mockRejectedValue(error),
    getTemplateBySlug: vi.fn().mockRejectedValue(error),
    getProfileById: vi.fn(),
    clonePublicTemplate: vi.fn(),
    updateTemplate: vi.fn(),
  });
  const loadPublic = (identifier: string, error: unknown) =>
    loadTemplateDetailData(
      { mode: 'public', identifier, ownerUsername: 'alice', cachedTemplates: [] },
      { apiClient: failingLookup(error) },
    );

  it('treats a 404 from the API as a settled not-found', async () => {
    const missing = createApiError(404, { error: 'Template not found' });

    expect(await loadPublic('camping-checklist', missing)).toEqual({
      loadError: false,
      notFound: true,
      template: null,
    });
    expect(await loadPublic('0b8f8f3e-6f1a-4b7e-9d8e-1f2a3b4c5d6e', missing)).toEqual({
      loadError: false,
      notFound: true,
      template: null,
    });
  });

  it('reports server, rate-limit and network failures as a load error, not a missing template', async () => {
    for (const error of [
      createApiError(500, { error: 'Internal error' }),
      createApiError(503),
      createApiError(429, { error: 'Too many requests' }),
      new TypeError('Failed to fetch'),
    ]) {
      expect(await loadPublic('camping-checklist', error)).toEqual({
        loadError: true,
        notFound: false,
        template: null,
      });
    }
  });

  it('keeps a missing identifier or owner as a settled not-found', async () => {
    const apiClient = failingLookup(new TypeError('Failed to fetch'));

    expect(
      await loadTemplateDetailData(
        { mode: 'public', identifier: undefined, ownerUsername: 'alice', cachedTemplates: [] },
        { apiClient },
      ),
    ).toEqual({ loadError: false, notFound: true, template: null });
    expect(
      await loadTemplateDetailData(
        { mode: 'public', identifier: 'camping-checklist', ownerUsername: undefined, cachedTemplates: [] },
        { apiClient },
      ),
    ).toEqual({ loadError: false, notFound: true, template: null });
    expect(apiClient.getTemplateBySlug).not.toHaveBeenCalled();
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

describe('resolveShareOwnerTemplate', () => {
  // Cached template lists carry the owner's username from when they were
  // fetched; after a rename, Share must not build a link with the old one.
  const renamedOwner = { userId: 'user-1', username: 'alicejones' };

  it("uses the signed-in owner's current username over a cached one", async () => {
    const apiClient = { getProfileById: vi.fn() };
    const template = buildTemplate({
      slug: 'seo-audit',
      ownerProfile: { username: 'alice', full_name: 'Alice' },
    });

    const shared = await resolveShareOwnerTemplate(template, renamedOwner, apiClient);

    expect(buildCanonicalPublicTemplatePath(shared)).toBe('/profile/alicejones/seo-audit');
    expect(shared.ownerProfile?.full_name).toBe('Alice');
    expect(apiClient.getProfileById).not.toHaveBeenCalled();
  });

  it('looks the owner up when the session has no username', async () => {
    const apiClient = { getProfileById: vi.fn().mockResolvedValue({ username: 'alicejones' }) };
    const template = buildTemplate({ slug: 'seo-audit', ownerProfile: undefined });

    const shared = await resolveShareOwnerTemplate(template, { userId: 'user-1' }, apiClient);

    expect(apiClient.getProfileById).toHaveBeenCalledWith('user-1');
    expect(buildCanonicalPublicTemplatePath(shared)).toBe('/profile/alicejones/seo-audit');
  });

  it("never puts the signed-in user's name on someone else's template", async () => {
    const apiClient = { getProfileById: vi.fn() };
    const template = buildTemplate({
      slug: 'seo-audit',
      userId: 'user-2',
      ownerProfile: { username: 'bob' },
    });

    const shared = await resolveShareOwnerTemplate(template, renamedOwner, apiClient);

    expect(buildCanonicalPublicTemplatePath(shared)).toBe('/profile/bob/seo-audit');
  });
});
