import { describe, expect, it, vi } from 'vitest';

import { loadPublicProfile } from '@/features/profile/loadPublicProfile';
import { ApiError, createApiError, UNREADABLE_RESPONSE_CODE, UNREADABLE_RESPONSE_MESSAGE } from '@/lib/api-errors';
import { REPO_TEMPLATE_OWNER_SLUG, repoTemplates } from '@/lib/repoTemplateCatalog';
import { objectContaining } from '../../../support/asymmetricMatchers';

const profileRow = {
  type: 'user' as const,
  avatar_url: null,
  created_at: '2026-01-15T10:00:00.000Z',
  full_name: 'Alice Example',
  id: 'user-1',
  username: 'alice',
};

const organizationRow = {
  type: 'team' as const,
  handle: 'Acme-Launch',
  name: 'Acme Launch',
  avatar_url: 'https://serplists.com/api/uploads/file?key=avatars%2Fowner%2Fa.webp',
  description: 'Launch checklists for agencies.',
};

const templateRow = {
  categories: ['Travel'],
  created_at: '2026-02-01T00:00:00.000Z',
  id: 'template-1',
  is_public: true,
  sections: [{ id: 's1', items: [{ id: 'i1', title: 'Tent' }], title: 'Pack' }],
  slug: 'camping-checklist',
  title: 'Camping Checklist',
  user_id: 'user-1',
};

const buildApiClient = (overrides: Record<string, unknown> = {}) => ({
  getPublicProfileByHandle: vi.fn().mockResolvedValue(profileRow),
  getPublicTemplatesForUser: vi.fn().mockResolvedValue([templateRow]),
  getPublicTemplatesForOrganization: vi.fn().mockResolvedValue([]),
  ...overrides,
});

describe('loadPublicProfile for a User', () => {
  it('looks the handle up in the registry, then loads the User and their public templates', async () => {
    const apiClient = buildApiClient();

    const result = await loadPublicProfile('ALICE', { apiClient });

    expect(apiClient.getPublicProfileByHandle).toHaveBeenCalledWith('ALICE');
    expect(apiClient.getPublicTemplatesForUser).toHaveBeenCalledWith('user-1');
    expect(apiClient.getPublicTemplatesForOrganization).not.toHaveBeenCalled();
    expect(result.kind).toBe('user');
    if (result.kind !== 'user') return;
    expect(result.profile.username).toBe('alice');
    expect(result.templates.map((template) => template.title)).toEqual(['Camping Checklist']);
  });

  it('keeps the type, owner and visibility of each public Template the API sends, as the Template lists do', async () => {
    const recipeRow = { ...templateRow, id: 'template-2', slug: 'pancakes', title: 'Pancakes', type: 'recipe', owner_type: 'user' };
    const apiClient = buildApiClient({ getPublicTemplatesForUser: vi.fn().mockResolvedValue([recipeRow]) });

    const result = await loadPublicProfile('alice', { apiClient });

    expect(result.kind === 'user' ? result.templates : []).toEqual([
      objectContaining({ id: 'template-2', type: 'recipe', ownerType: 'user', isPublic: true }),
    ]);
  });

  it('reads the D1 created_at as UTC and hands the page an ISO timestamp', async () => {
    const apiClient = buildApiClient({
      getPublicProfileByHandle: vi.fn().mockResolvedValue({ ...profileRow, created_at: '2025-12-26 09:18:30' }),
    });

    const result = await loadPublicProfile('alice', { apiClient });

    expect(result.kind === 'user' ? result.profile.created_at : undefined).toBe('2025-12-26T09:18:30.000Z');
  });

  it('keeps the profile when created_at is missing or unreadable', async () => {
    const apiClient = buildApiClient({
      getPublicProfileByHandle: vi.fn().mockResolvedValue({ ...profileRow, created_at: 'soon' }),
    });

    const result = await loadPublicProfile('alice', { apiClient });

    expect(result.kind === 'user' ? result.profile.created_at : undefined).toBeNull();
  });

  it('serves the library profile from the bundle whatever the API error', async () => {
    const apiClient = buildApiClient({
      getPublicProfileByHandle: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    });

    const result = await loadPublicProfile(REPO_TEMPLATE_OWNER_SLUG, { apiClient });

    expect(result.kind).toBe('user');
    if (result.kind !== 'user') return;
    expect(result.profile.username).toBe(REPO_TEMPLATE_OWNER_SLUG);
    expect(result.templates).toHaveLength(repoTemplates.length);
  });

  it('reports a failed template list as a failed load', async () => {
    const apiClient = buildApiClient({
      getPublicTemplatesForUser: vi.fn().mockRejectedValue(createApiError(500)),
    });

    expect((await loadPublicProfile('alice', { apiClient })).kind).toBe('error');
  });
});

describe('loadPublicProfile for an Organization', () => {
  it('loads the Organization the handle names and its public templates by its handle', async () => {
    const organizationTemplate = { ...templateRow, owner_type: 'team', owner: { type: 'team', publicHandle: 'Acme-Launch', displayName: 'Acme Launch' } };
    const apiClient = buildApiClient({
      getPublicProfileByHandle: vi.fn().mockResolvedValue(organizationRow),
      getPublicTemplatesForOrganization: vi.fn().mockResolvedValue([organizationTemplate]),
    });

    const result = await loadPublicProfile('acme-launch', { apiClient });

    expect(apiClient.getPublicTemplatesForOrganization).toHaveBeenCalledWith('Acme-Launch');
    expect(apiClient.getPublicTemplatesForUser).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: 'organization',
      organization: {
        avatar_url: organizationRow.avatar_url,
        description: 'Launch checklists for agencies.',
        handle: 'Acme-Launch',
        name: 'Acme Launch',
      },
      templates: [objectContaining({ id: 'template-1', ownerType: 'team' })],
    });
  });

  it('never serves the bundled library under an Organization that holds the handle', async () => {
    const apiClient = buildApiClient({
      getPublicProfileByHandle: vi.fn().mockResolvedValue({ ...organizationRow, handle: REPO_TEMPLATE_OWNER_SLUG }),
    });

    const result = await loadPublicProfile(REPO_TEMPLATE_OWNER_SLUG, { apiClient });

    expect(result).toMatchObject({ kind: 'organization', templates: [] });
  });

  it('reports a failed template list as a failed load, not an empty profile', async () => {
    const apiClient = buildApiClient({
      getPublicProfileByHandle: vi.fn().mockResolvedValue(organizationRow),
      getPublicTemplatesForOrganization: vi.fn().mockRejectedValue(createApiError(503)),
    });

    expect(await loadPublicProfile('acme-launch', { apiClient })).toEqual({
      kind: 'error',
      message: 'Unable to load this public profile.',
    });
  });
});

describe('loadPublicProfile when the handle names no one', () => {
  it('says the profile was not found only when the API answers 404', async () => {
    const apiClient = buildApiClient({
      getPublicProfileByHandle: vi.fn().mockRejectedValue(createApiError(404, { error: 'Profile not found' })),
    });

    await expect(loadPublicProfile('ghost', { apiClient })).resolves.toEqual({ kind: 'not_found' });
    expect(apiClient.getPublicTemplatesForUser).not.toHaveBeenCalled();
    expect(apiClient.getPublicTemplatesForOrganization).not.toHaveBeenCalled();
    await expect(loadPublicProfile(undefined, { apiClient })).resolves.toEqual({ kind: 'not_found' });
  });

  it.each([
    ['a server error', createApiError(503, { error: 'Service unavailable' })],
    ['a rate limit', createApiError(429, { error: 'Too many requests' })],
    ['a network failure', new TypeError('Failed to fetch')],
    ['a response of the wrong shape', new ApiError({ status: 200, message: UNREADABLE_RESPONSE_MESSAGE, code: UNREADABLE_RESPONSE_CODE })],
  ])('reports %s as a failed load, not a missing profile', async (_label, error) => {
    const apiClient = buildApiClient({ getPublicProfileByHandle: vi.fn().mockRejectedValue(error) });

    const result = await loadPublicProfile('alice', { apiClient });

    expect(result).toEqual({ kind: 'error', message: 'Unable to load this public profile.' });
    expect(apiClient.getPublicTemplatesForUser).not.toHaveBeenCalled();
  });
});
