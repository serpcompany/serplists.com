import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadPublicProfile } from '@/features/public-profile/loadPublicProfile';
import { createApiError } from '@/lib/api-errors';
import { REPO_TEMPLATE_OWNER_SLUG, repoTemplates } from '@/lib/repoTemplateCatalog';

const aliceProfile = {
  id: 'user-1',
  full_name: 'Alice Example',
  username: 'alice',
  avatar_url: null,
  created_at: '2026-04-18T00:00:00.000Z',
};

const aliceTemplate = {
  id: 'template-1',
  title: 'Camping Checklist',
  user_id: 'user-1',
  created_at: '2026-04-18T00:00:00.000Z',
  is_public: true,
  slug: 'camping-checklist',
  owner_username: 'alice',
};

const apiClient = (overrides: {
  profile?: () => Promise<unknown>;
  templates?: () => Promise<unknown>;
}) => ({
  getProfileByUsername: vi.fn(overrides.profile ?? (async () => aliceProfile)),
  getPublicTemplatesForUser: vi.fn(overrides.templates ?? (async () => [aliceTemplate])),
});

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadPublicProfile', () => {
  it('loads a profile and its public templates', async () => {
    const result = await loadPublicProfile('alice', apiClient({}));

    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.profile.username).toBe('alice');
    expect(result.templates.map((template) => template.slug)).toEqual(['camping-checklist']);
  });

  // Only a settled 404 may render the noindex "User not found" state.
  it('treats a 404 for the username as a settled not-found', async () => {
    const client = apiClient({
      profile: async () => { throw createApiError(404, { error: 'User not found' }); },
    });

    expect(await loadPublicProfile('nobody', client)).toEqual({ status: 'not_found' });
    expect(client.getPublicTemplatesForUser).not.toHaveBeenCalled();
  });

  it('reports server, rate-limit and network failures as a load error, not a missing user', async () => {
    for (const error of [
      createApiError(500, { error: 'Internal error' }),
      createApiError(429, { error: 'Too many requests' }),
      new TypeError('Failed to fetch'),
    ]) {
      const client = apiClient({ profile: async () => { throw error; } });
      expect(await loadPublicProfile('alice', client)).toEqual({ status: 'error' });
    }
  });

  it('reports a failed template list as a load error', async () => {
    const client = apiClient({ templates: async () => { throw new TypeError('Failed to fetch'); } });

    expect(await loadPublicProfile('alice', client)).toEqual({ status: 'error' });
  });

  it('treats a missing username as not found without calling the API', async () => {
    const client = apiClient({});

    expect(await loadPublicProfile(undefined, client)).toEqual({ status: 'not_found' });
    expect(client.getProfileByUsername).not.toHaveBeenCalled();
  });

  it('still shows the official profile from the bundled templates when the API fails', async () => {
    const client = apiClient({ profile: async () => { throw new TypeError('Failed to fetch'); } });
    const result = await loadPublicProfile(REPO_TEMPLATE_OWNER_SLUG.toUpperCase(), client);

    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.profile.username).toBe(REPO_TEMPLATE_OWNER_SLUG);
    expect(result.templates).toHaveLength(repoTemplates.length);
  });
});
