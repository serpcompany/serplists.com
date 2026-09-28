import { describe, expect, it, vi } from 'vitest';

import { loadUserProfile } from '@/features/profile/loadUserProfile';
import { createApiError } from '@/lib/api-errors';
import { REPO_TEMPLATE_OWNER_SLUG, repoTemplates } from '@/lib/repoTemplateCatalog';

const profileRow = {
  avatar_url: null,
  created_at: '2026-01-15T10:00:00.000Z',
  full_name: 'Alice Example',
  id: 'user-1',
  username: 'alice',
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
  getProfileByUsername: vi.fn().mockResolvedValue(profileRow),
  getPublicTemplatesForUser: vi.fn().mockResolvedValue([templateRow]),
  ...overrides,
});

describe('loadUserProfile', () => {
  it('loads the profile and its public templates', async () => {
    const apiClient = buildApiClient();

    const result = await loadUserProfile('alice', { apiClient });

    expect(apiClient.getPublicTemplatesForUser).toHaveBeenCalledWith('user-1');
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.profile.username).toBe('alice');
    expect(result.templates.map((template) => template.title)).toEqual(['Camping Checklist']);
  });

  it('reads the D1 created_at as UTC and hands the page an ISO timestamp', async () => {
    const apiClient = buildApiClient({
      getProfileByUsername: vi.fn().mockResolvedValue({ ...profileRow, created_at: '2025-12-26 09:18:30' }),
    });

    const result = await loadUserProfile('alice', { apiClient });

    expect(result.kind === 'ok' ? result.profile.created_at : undefined).toBe(
      '2025-12-26T09:18:30.000Z',
    );
  });

  it('keeps the profile when created_at is missing or unreadable', async () => {
    const apiClient = buildApiClient({
      getProfileByUsername: vi.fn().mockResolvedValue({ ...profileRow, created_at: 'soon' }),
    });

    const result = await loadUserProfile('alice', { apiClient });

    expect(result.kind === 'ok' ? result.profile.created_at : undefined).toBeNull();
  });

  it('says the user was not found only when the API answers 404', async () => {
    const apiClient = buildApiClient({
      getProfileByUsername: vi.fn().mockRejectedValue(createApiError(404, { error: 'User not found' })),
    });

    await expect(loadUserProfile('ghost', { apiClient })).resolves.toEqual({ kind: 'not_found' });
    expect(apiClient.getPublicTemplatesForUser).not.toHaveBeenCalled();
    await expect(loadUserProfile(undefined, { apiClient })).resolves.toEqual({ kind: 'not_found' });
  });

  it.each([
    ['a server error', createApiError(503, { error: 'Service unavailable' })],
    ['a rate limit', createApiError(429, { error: 'Too many requests' })],
    ['a network failure', new TypeError('Failed to fetch')],
  ])('reports %s as a failed load, not a missing user', async (_label, error) => {
    const apiClient = buildApiClient({ getProfileByUsername: vi.fn().mockRejectedValue(error) });

    const result = await loadUserProfile('alice', { apiClient });

    expect(result).toEqual({ kind: 'error', message: 'Unable to load this public profile.' });
  });

  it('reports a profile response of the wrong shape as a failed load', async () => {
    const apiClient = buildApiClient({
      getProfileByUsername: vi.fn().mockResolvedValue({ error: 'unexpected' }),
    });

    const result = await loadUserProfile('alice', { apiClient });

    expect(result.kind).toBe('error');
    expect(apiClient.getPublicTemplatesForUser).not.toHaveBeenCalled();
  });

  it('reports a failed template list as a failed load', async () => {
    const apiClient = buildApiClient({
      getPublicTemplatesForUser: vi.fn().mockRejectedValue(createApiError(500)),
    });

    const result = await loadUserProfile('alice', { apiClient });

    expect(result.kind).toBe('error');
  });

  it('serves the library profile from the bundle whatever the API error', async () => {
    const apiClient = buildApiClient({
      getProfileByUsername: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    });

    const result = await loadUserProfile(REPO_TEMPLATE_OWNER_SLUG, { apiClient });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.profile.username).toBe(REPO_TEMPLATE_OWNER_SLUG);
    expect(result.templates).toHaveLength(repoTemplates.length);
  });
});
