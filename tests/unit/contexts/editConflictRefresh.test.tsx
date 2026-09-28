import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApiError } from '@/lib/api-errors';
import type { ChecklistRun, ChecklistTemplate, TemplatesContextProps } from '@/types/checklist';

// Revalidate and the visibility switch send the revision or version of a cached copy. When
// the record changed elsewhere the server answers 409 edit_conflict. Unless the cache is
// refreshed, every retry sends the same stale value and fails the same way.

const apiMock = vi.hoisted(() => ({ revalidateChecklist: vi.fn(), updateTemplate: vi.fn() }));

vi.mock('@/lib/api', () => ({ api: apiMock }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({ activeTeamId: undefined, isWorkspaceLoading: false, workspaceScopeId: 'personal' }),
}));

import { TemplatesProvider, useTemplates } from '@/contexts/TemplatesContext';

const run = (revision: number): ChecklistRun => ({
  id: 'run-1',
  templateId: 'template-1',
  title: 'Launch',
  status: 'in_progress',
  progress: 0,
  sections: [],
  startedAt: '2026-09-01T00:00:00.000Z',
  userId: 'user-1',
  isStale: true,
  revision,
});

const template: ChecklistTemplate = {
  id: 'template-1',
  title: 'Launch Checklist',
  description: '',
  sections: [],
  userId: 'user-1',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  isPublic: false,
  categories: [],
  tags: [],
  version: 3,
};

const clients: QueryClient[] = [];

function renderProvider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  let context: TemplatesContextProps | undefined;
  const Probe = () => {
    context = useTemplates();
    return null;
  };
  renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <TemplatesProvider>
        <Probe />
      </TemplatesProvider>
    </QueryClientProvider>,
  );
  if (!context) throw new Error('TemplatesProvider did not render');
  return { client, context };
}

// The runs page: an active observer on the runs list, which the server now has at revision 5.
async function showRunsList(client: QueryClient) {
  const listFetch = vi.fn(async () => [run(4)]);
  const observer = new QueryObserver(client, {
    queryKey: ['runs', 'user-1', 'personal'],
    queryFn: listFetch,
    staleTime: 5 * 60 * 1000,
  });
  const unsubscribe = observer.subscribe(() => {});
  await vi.waitFor(() => expect(client.getQueryData(['runs', 'user-1', 'personal'])).toEqual([run(4)]));
  listFetch.mockClear();
  listFetch.mockResolvedValue([run(5)]);
  return { listFetch, unsubscribe };
}

const conflict = (code: string) => createApiError(409, { error: 'Checklist run changed since it was loaded.', code });

describe('conflict refresh', () => {
  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
    apiMock.revalidateChecklist.mockReset();
    apiMock.updateTemplate.mockReset();
  });

  it('refreshes the runs list before Revalidate rejects, so the next click sends the new revision', async () => {
    const { client, context } = renderProvider();
    const { listFetch, unsubscribe } = await showRunsList(client);
    apiMock.revalidateChecklist.mockRejectedValueOnce(conflict('edit_conflict')).mockResolvedValueOnce(undefined);

    await expect(context.revalidateRun(run(4))).rejects.toMatchObject({ status: 409 });

    // The refetch finished before the rejection, so the button re-enables on fresh data.
    expect(listFetch).toHaveBeenCalledTimes(1);
    const [refreshed] = client.getQueryData<ChecklistRun[]>(['runs', 'user-1', 'personal']) ?? [];
    expect(refreshed.revision).toBe(5);
    await context.revalidateRun(refreshed);
    expect(apiMock.revalidateChecklist).toHaveBeenLastCalledWith('run-1', 5);
    unsubscribe();
  });

  it.each([
    ['a run made public elsewhere', conflict('shared_run_conflict')],
    ['a run archived elsewhere', createApiError(404, { error: 'Checklist not found' })],
  ])('also refreshes the runs list for %s', async (_name, error) => {
    const { client, context } = renderProvider();
    const { listFetch, unsubscribe } = await showRunsList(client);
    apiMock.revalidateChecklist.mockRejectedValueOnce(error);

    await expect(context.revalidateRun(run(4))).rejects.toBe(error);

    expect(listFetch).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('does not reload the runs list for a failure a refresh cannot fix', async () => {
    const { client, context } = renderProvider();
    const { listFetch, unsubscribe } = await showRunsList(client);
    apiMock.revalidateChecklist.mockRejectedValueOnce(createApiError(500, { error: 'Internal error' }));

    await expect(context.revalidateRun(run(4))).rejects.toMatchObject({ status: 500 });

    expect(listFetch).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('marks the Template lists stale after a template edit conflict', async () => {
    const { client, context } = renderProvider();
    client.setQueryData(['templates', 'user-1', 'personal'], [template]);
    apiMock.updateTemplate.mockRejectedValueOnce(
      createApiError(409, { error: 'Template changed since it was loaded.', code: 'edit_conflict' }),
    );

    await expect(context.updateTemplate({ ...template, isPublic: true })).rejects.toMatchObject({ status: 409 });

    expect(client.getQueryState(['templates', 'user-1', 'personal'])?.isInvalidated).toBe(true);
  });
});
