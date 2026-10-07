import { focusManager, QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildTemplateDetailQueryOptions } from '@/features/template-detail/templateDetailQuery';
import { createApiError } from '@/lib/api-errors';
import { queryKeys } from '@/lib/queryCache';
import { repoTemplates } from '@/lib/repoTemplateCatalog';

import { APP_QUERY_STALE_TIME, createQueryClientWithAppDefaults } from '../../../support/appQueryClient';

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
  getTemplates: vi.fn(),
  updateTemplate: vi.fn(),
});

const unsubscribers: Array<() => void> = [];

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

    const result = await settled(openPage(createQueryClientWithAppDefaults(), apiClient));

    expect(result.data?.title).toBe('Camping Checklist');
    expect(result.data?.version).toBe(3);
    expect(apiClient.getTemplateById).toHaveBeenCalledTimes(1);
    expect(apiClient.getTemplateById).toHaveBeenCalledWith('template-1');
    expect(apiClient.getTemplates).not.toHaveBeenCalled();
  });

  it('refetches the open template when a template mutation invalidates templates, so later writes send the new version', async () => {
    const queryClient = createQueryClientWithAppDefaults();
    const apiClient = buildApiClient(
      vi
        .fn()
        .mockResolvedValueOnce(serverRow())
        .mockResolvedValueOnce(serverRow({ is_public: false, version: 4 })),
    );
    const observer = openPage(queryClient, apiClient);
    await settled(observer);

    await queryClient.invalidateQueries({ queryKey: ['templates'] });
    const result = await settled(observer);

    expect(apiClient.getTemplateById).toHaveBeenCalledTimes(2);
    expect(result.data?.version).toBe(4);
    expect(result.data?.isPublic).toBe(false);
    expect(apiClient.getTemplates).not.toHaveBeenCalled();
  });

  it('does not fetch again when the tab regains focus after the template went stale', async () => {
    const queryClient = createQueryClientWithAppDefaults();
    queryClient.mount();
    const apiClient = buildApiClient(vi.fn().mockResolvedValue(serverRow()));
    const observer = openPage(queryClient, apiClient);
    const loaded = await settled(observer);

    const loadedPastTheStaleTime = Date.now() - 2 * APP_QUERY_STALE_TIME;
    queryClient.setQueryData(queryKeys.templateDetail('template-1', 'user-1'), loaded.data, {
      updatedAt: loadedPastTheStaleTime,
    });
    try {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await settled(observer);
    } finally {
      focusManager.setFocused(undefined);
      queryClient.unmount();
    }

    expect(apiClient.getTemplateById).toHaveBeenCalledTimes(1);
  });

  it('resolves a library template from the bundle without a request', async () => {
    const libraryTemplate = repoTemplates[0];
    const apiClient = buildApiClient();

    const result = await settled(openPage(createQueryClientWithAppDefaults(), apiClient, libraryTemplate?.id));

    expect(result.data).toEqual(libraryTemplate);
    expect(apiClient.getTemplateById).not.toHaveBeenCalled();
  });

  it('answers null for a template the server says is gone', async () => {
    const apiClient = buildApiClient(
      vi.fn().mockRejectedValue(createApiError(404, { error: 'Template not found' })),
    );

    const result = await settled(
      openPage(createQueryClientWithAppDefaults(), apiClient, '4f7c1a52-9b1e-4c1d-8a61-2f8e5b3c9d10'),
    );

    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
  });

  it('fails with a retryable message, and a failed refresh keeps the template on screen', async () => {
    const queryClient = createQueryClientWithAppDefaults();
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
    const key = queryKeys.templateDetail('template-1', 'user-1');

    expect(key[0]).toBe('templates');
    expect(key).not.toEqual(queryKeys.templateDetail('template-1', 'user-2'));
    expect(key).not.toEqual(queryKeys.templateDetail('template-2', 'user-1'));
  });
});
