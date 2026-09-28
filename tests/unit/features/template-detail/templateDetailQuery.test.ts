import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildTemplateDetailQueryOptions,
  getTemplateDetailQueryKey,
} from '@/features/template-detail/templateDetailQuery';
import { createApiError } from '@/lib/api-errors';
import { repoTemplates } from '@/lib/repoTemplateCatalog';

const serverRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'template-1',
  title: 'Camping Checklist',
  sections: [{ id: 'section-1', title: 'Pack', items: [{ id: 'item-1', title: 'Tent' }] }],
  user_id: 'user-1',
  owner_username: 'alice',
  created_at: '2026-04-18T00:00:00.000Z',
  is_public: true,
  slug: 'camping-checklist',
  version: 3,
  ...overrides,
});

const buildApiClient = (getTemplateById = vi.fn()) => ({
  clonePublicTemplate: vi.fn(),
  getBillingStatus: vi.fn(),
  getProfileById: vi.fn(),
  getTemplateById,
  getTemplateBySlug: vi.fn(),
  // A detail page has no business with any list endpoint.
  getTemplates: vi.fn(),
  updateTemplate: vi.fn(),
});

// The app's defaults (src/App.tsx), so the test sees the same caching as the page.
const buildQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 60 * 1000 } } });

const unsubscribers: Array<() => void> = [];

// An observer is what an open page holds: it fetches on subscribe and refetches on invalidation.
const openPage = (queryClient: QueryClient, apiClient: ReturnType<typeof buildApiClient>, identifier = 'template-1') => {
  const observer = new QueryObserver(
    queryClient,
    buildTemplateDetailQueryOptions({ apiClient, identifier, userId: 'user-1' }),
  );
  unsubscribers.push(observer.subscribe(() => undefined));
  return observer;
};

const settled = async (observer: ReturnType<typeof openPage>) => {
  await vi.waitFor(() => {
    const current = observer.getCurrentResult();
    expect(current.status).not.toBe('pending');
    expect(current.fetchStatus).toBe('idle');
  });
  return observer.getCurrentResult();
};

afterEach(() => {
  unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
});

describe('template detail query', () => {
  it('loads the template with one request by id and no list request', async () => {
    const apiClient = buildApiClient(vi.fn().mockResolvedValue(serverRow()));

    const result = await settled(openPage(buildQueryClient(), apiClient));

    expect(result.data?.title).toBe('Camping Checklist');
    expect(result.data?.version).toBe(3);
    expect(apiClient.getTemplateById).toHaveBeenCalledTimes(1);
    expect(apiClient.getTemplateById).toHaveBeenCalledWith('template-1');
    expect(apiClient.getTemplates).not.toHaveBeenCalled();
  });

  it('refetches the open template when templates are invalidated, so later writes send the new version', async () => {
    const queryClient = buildQueryClient();
    const apiClient = buildApiClient(
      vi
        .fn()
        .mockResolvedValueOnce(serverRow())
        .mockResolvedValueOnce(serverRow({ is_public: false, version: 4 })),
    );
    const observer = openPage(queryClient, apiClient);
    await settled(observer);

    // Every template mutation (edit, visibility, Share, copy, archive, context switch) does this.
    await queryClient.invalidateQueries({ queryKey: ['templates'] });
    const result = await settled(observer);

    expect(apiClient.getTemplateById).toHaveBeenCalledTimes(2);
    expect(result.data?.version).toBe(4);
    expect(result.data?.isPublic).toBe(false);
    expect(apiClient.getTemplates).not.toHaveBeenCalled();
  });

  it('resolves a library template from the bundle without a request', async () => {
    const libraryTemplate = repoTemplates[0];
    const apiClient = buildApiClient();

    const result = await settled(openPage(buildQueryClient(), apiClient, libraryTemplate?.id));

    expect(result.data).toEqual(libraryTemplate);
    expect(apiClient.getTemplateById).not.toHaveBeenCalled();
  });

  it('answers null for a template the server says is gone', async () => {
    const apiClient = buildApiClient(
      vi.fn().mockRejectedValue(createApiError(404, { error: 'Template not found' })),
    );

    const result = await settled(
      openPage(buildQueryClient(), apiClient, '4f7c1a52-9b1e-4c1d-8a61-2f8e5b3c9d10'),
    );

    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
  });

  it('fails with a retryable message, and a failed refresh keeps the template on screen', async () => {
    const queryClient = buildQueryClient();
    const apiClient = buildApiClient(
      vi
        .fn()
        .mockResolvedValueOnce(serverRow())
        .mockRejectedValue(createApiError(503, { error: 'Service unavailable' })),
    );
    const observer = openPage(queryClient, apiClient);
    await settled(observer);

    await queryClient.invalidateQueries({ queryKey: ['templates'] });
    const result = await settled(observer);

    expect(result.error?.message).toBe('Service unavailable');
    expect(result.data?.title).toBe('Camping Checklist');
  });

  it('keys each template and user under the templates prefix', () => {
    const key = getTemplateDetailQueryKey('template-1', 'user-1');

    expect(key[0]).toBe('templates');
    expect(key).not.toEqual(getTemplateDetailQueryKey('template-1', 'user-2'));
    expect(key).not.toEqual(getTemplateDetailQueryKey('template-2', 'user-1'));
  });
});
