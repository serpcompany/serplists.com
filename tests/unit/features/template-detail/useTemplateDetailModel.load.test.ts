import { assert, describe, expect, it, vi } from 'vitest';

import { createApiError } from '@/lib/api-errors';
import { countTemplateItems } from '@/lib/templates/templateItemCount';

import { mapApiTemplateToChecklistTemplate } from '@/features/template-detail/templateDetailMappers';
import { loadTemplateDetailData, type LoadTemplateDetailResult } from '@/features/template-detail/loadTemplateDetail';

import { templateDetailApiClient } from '../../../fixtures/templateDetailApiClient';

const loadedTemplate = (result: LoadTemplateDetailResult) =>
  result.kind === 'ok' ? result.template : null;

const LEGACY_FLAT_ITEMS = JSON.stringify([
  { id: 'item-1', title: 'Bring tent' },
  { id: 'item-2', title: 'Pack stove' },
]);

const campingChecklistRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'template-1',
  title: 'Camping Checklist',
  sections: [],
  user_id: 'user-1',
  created_at: '2026-04-18T00:00:00.000Z',
  updated_at: '2026-04-18T00:00:00.000Z',
  is_public: true,
  slug: 'camping-checklist',
  ...overrides,
});

const loadAlicesPublicTemplate = (identifier: string, apiClient: ReturnType<typeof templateDetailApiClient>) =>
  loadTemplateDetailData({ mode: 'public', identifier, ownerUsername: 'alice' }, { apiClient });

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
        items: LEGACY_FLAT_ITEMS,
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
    const apiClient = templateDetailApiClient({
      getTemplateBySlug: vi.fn().mockResolvedValue(campingChecklistRow()),
      getProfileById: vi.fn().mockResolvedValue({ username: 'alice', full_name: 'Alice Example' }),
    });

    const result = await loadAlicesPublicTemplate('camping-checklist', apiClient);

    expect(result.kind).toBe('ok');
    expect(loadedTemplate(result)?.ownerProfile).toEqual({
      username: 'alice',
      full_name: 'Alice Example',
    });
    expect(apiClient.getTemplateBySlug).toHaveBeenCalledWith(
      'camping-checklist',
    );
    expect(apiClient.getProfileById).toHaveBeenCalledWith('user-1');
  });

  it('normalizes legacy flat items during model loading', async () => {
    const apiClient = templateDetailApiClient({
      getTemplateBySlug: vi.fn().mockResolvedValue({
        id: 'legacy-template',
        title: 'Legacy Checklist',
        items: LEGACY_FLAT_ITEMS,
        user_id: 'user-1',
        created_at: '2026-04-18T00:00:00.000Z',
        updated_at: '2026-04-18T00:00:00.000Z',
        is_public: true,
        slug: 'legacy-checklist',
        owner_username: 'alice',
      }),
    });

    const result = await loadAlicesPublicTemplate('legacy-checklist', apiClient);

    expect(result.kind).toBe('ok');
    expect(loadedTemplate(result)?.sections).toHaveLength(1);
    const template = loadedTemplate(result);
    assert.exists(template);
    expect(template.sections[0]?.items).toHaveLength(2);
    expect(countTemplateItems(template)).toBe(2);
  });

  it('returns not_found when the owner segment does not match', async () => {
    const apiClient = templateDetailApiClient({
      getTemplateBySlug: vi.fn().mockResolvedValue(campingChecklistRow({ owner_username: 'bob' })),
    });

    const result = await loadAlicesPublicTemplate('camping-checklist', apiClient);

    expect(result).toEqual({ kind: 'not_found' });
  });

  it('keeps the Organization of a private template that is not in the cached list', async () => {
    const apiClient = templateDetailApiClient({
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
    });

    const result = await loadTemplateDetailData(
      {
        mode: 'private',
        identifier: 'template-t',
      },
      { apiClient },
    );

    expect(result.kind).toBe('ok');
    expect(loadedTemplate(result)?.teamId).toBe('team-1');
    expect(loadedTemplate(result)?.userId).toBe('user-b');
  });

  const failingLookup = (error: unknown) =>
    templateDetailApiClient({
      getTemplateById: vi.fn().mockRejectedValue(error),
      getTemplateBySlug: vi.fn().mockRejectedValue(error),
    });
  const loadPublic = (identifier: string, error: unknown) => loadAlicesPublicTemplate(identifier, failingLookup(error));

  it('treats a 404 from the API as a settled not-found, the only answer that renders the noindex Template not found state', async () => {
    const missing = createApiError(404, { error: 'Template not found' });

    expect(await loadPublic('camping-checklist', missing)).toEqual({ kind: 'not_found' });
    expect(await loadPublic('0b8f8f3e-6f1a-4b7e-9d8e-1f2a3b4c5d6e', missing)).toEqual({
      kind: 'not_found',
    });
  });

  it('reports server, rate-limit and network failures as a load error, not a missing template, so crawlers never read a real public template as gone', async () => {
    for (const error of [
      createApiError(500, { error: 'Internal error' }),
      createApiError(503),
      createApiError(429, { error: 'Too many requests' }),
      new TypeError('Failed to fetch'),
    ]) {
      expect((await loadPublic('camping-checklist', error)).kind).toBe('error');
    }
  });

  it('keeps a missing identifier or owner as a settled not-found', async () => {
    const apiClient = failingLookup(new TypeError('Failed to fetch'));

    expect(
      await loadTemplateDetailData(
        { mode: 'public', identifier: undefined, ownerUsername: 'alice' },
        { apiClient },
      ),
    ).toEqual({ kind: 'not_found' });
    expect(
      await loadTemplateDetailData(
        { mode: 'public', identifier: 'camping-checklist', ownerUsername: undefined },
        { apiClient },
      ),
    ).toEqual({ kind: 'not_found' });
    expect(apiClient.getTemplateBySlug).not.toHaveBeenCalled();
  });
});
