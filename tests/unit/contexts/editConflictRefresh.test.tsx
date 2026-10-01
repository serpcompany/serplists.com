import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApiError } from '@/lib/api-errors';
import type { ChecklistRun, ChecklistTemplate } from '@/types/checklist';

const apiMock = vi.hoisted(() => ({
  createChecklist: vi.fn(),
  deleteChecklist: vi.fn(),
  deleteTemplate: vi.fn(),
  revalidateChecklist: vi.fn(),
  updateTemplate: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ api: apiMock }));
import { aTemplatesProviderForEachTest, launchChecklist } from '../../support/templatesProviderHarness';

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

const template = launchChecklist({
  sections: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
});

const renderProvider = aTemplatesProviderForEachTest();

async function showAListThatWillReadNext<T>(client: QueryClient, queryKey: unknown[], shown: T[], next: T[]) {
  const listFetch = vi.fn(async () => shown);
  const observer = new QueryObserver(client, { queryKey, queryFn: listFetch, staleTime: 5 * 60 * 1000 });
  const unsubscribe = observer.subscribe(() => {});
  await vi.waitFor(() => expect(client.getQueryData(queryKey)).toEqual(shown));
  listFetch.mockClear();
  listFetch.mockResolvedValue(next);
  return { listFetch, unsubscribe };
}

const showRunsPageWhileTheServerHoldsRevision5 = (client: QueryClient) =>
  showAListThatWillReadNext(client, ['runs', 'user-1', 'personal'], [run(4)], [run(5)]);

const conflict = (code: string) => createApiError(409, { error: 'Checklist run changed since it was loaded.', code });

describe('refresh after a conflict, so a retry sends the current revision or version instead of failing the same way', () => {
  afterEach(() => {
    Object.values(apiMock).forEach((mock) => mock.mockReset());
  });

  it('refreshes the runs list before Revalidate rejects, so the next click sends the new revision', async () => {
    const { client, context } = renderProvider();
    const { listFetch, unsubscribe } = await showRunsPageWhileTheServerHoldsRevision5(client);
    apiMock.revalidateChecklist.mockRejectedValueOnce(conflict('edit_conflict')).mockResolvedValueOnce(undefined);

    await expect(context.revalidateRun(run(4))).rejects.toMatchObject({ status: 409 });

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
    const { listFetch, unsubscribe } = await showRunsPageWhileTheServerHoldsRevision5(client);
    apiMock.revalidateChecklist.mockRejectedValueOnce(error);

    await expect(context.revalidateRun(run(4))).rejects.toBe(error);

    expect(listFetch).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('does not reload the runs list for a failure a refresh cannot fix', async () => {
    const { client, context } = renderProvider();
    const { listFetch, unsubscribe } = await showRunsPageWhileTheServerHoldsRevision5(client);
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

async function showTemplateListWithTheCatalogCached(client: QueryClient) {
  const shown = await showAListThatWillReadNext(client, ['templates', 'user-1', 'personal'], [template], []);
  client.setQueryData(['templates', 'catalog'], [template, { ...template, id: 'template-2' }]);
  return shown;
}

const archivedTemplate = () => createApiError(404, { error: 'Template not found or unauthorized' });
const archivedRun = () => createApiError(404, { error: 'Checklist not found or unauthorized' });
const serverError = () => createApiError(500, { error: 'Internal error' });

async function openTemplatePageThatWillFindItGone(client: QueryClient) {
  const detailKey = ['templates', 'detail', 'template-1', 'user-1'];
  const detailFetch = vi.fn<() => Promise<ChecklistTemplate | null>>(async () => template);
  const detail = new QueryObserver(client, { queryKey: detailKey, queryFn: detailFetch, staleTime: 60_000 });
  const close = detail.subscribe(() => {});
  await vi.waitFor(() => expect(client.getQueryData(detailKey)).toEqual(template));
  detailFetch.mockResolvedValue(null);
  return { detailKey, close };
}

describe('refresh after an action on an item archived elsewhere, which the cached lists can show for up to 5 minutes', () => {
  afterEach(() => {
    Object.values(apiMock).forEach((mock) => mock.mockReset());
  });

  it('reloads the runs list before Archive on a run rejects', async () => {
    const { client, context } = renderProvider();
    const { listFetch, unsubscribe } = await showRunsPageWhileTheServerHoldsRevision5(client);
    listFetch.mockResolvedValue([]);
    const error = archivedRun();
    apiMock.deleteChecklist.mockRejectedValueOnce(error);

    await expect(context.deleteRun('run-1')).rejects.toBe(error);

    expect(listFetch).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['runs', 'user-1', 'personal'])).toEqual([]);
    unsubscribe();
  });

  it('reloads the Template list before Archive on a template rejects, and drops it from the cached catalog without refetching the edge copy, which can still list it', async () => {
    const { client, context } = renderProvider();
    const { listFetch, unsubscribe } = await showTemplateListWithTheCatalogCached(client);
    const templatePage = await openTemplatePageThatWillFindItGone(client);
    const error = archivedTemplate();
    apiMock.deleteTemplate.mockRejectedValueOnce(error);

    await expect(context.deleteTemplate('template-1')).rejects.toBe(error);

    expect(listFetch).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['templates', 'user-1', 'personal'])).toEqual([]);
    expect(client.getQueryData(templatePage.detailKey)).toBeNull();
    templatePage.close();
    expect(client.getQueryData<ChecklistTemplate[]>(['templates', 'catalog'])?.map((item) => item.id)).toEqual([
      'template-2',
    ]);
    expect(client.getQueryState(['templates', 'catalog'])?.isInvalidated).toBe(false);
    unsubscribe();
  });

  it('reloads the Template list before Start Run on an archived template rejects', async () => {
    const { client, context } = renderProvider();
    const { listFetch, unsubscribe } = await showTemplateListWithTheCatalogCached(client);
    const error = createApiError(404, { error: 'Template not found' });
    apiMock.createChecklist.mockRejectedValueOnce(error);

    await expect(context.createRun({ templateId: 'template-1', template })).rejects.toBe(error);

    expect(listFetch).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['templates', 'user-1', 'personal'])).toEqual([]);
    unsubscribe();
  });

  it('does not reload the lists for a failure a refresh cannot fix', async () => {
    const { client, context } = renderProvider();
    const runs = await showRunsPageWhileTheServerHoldsRevision5(client);
    const templates = await showTemplateListWithTheCatalogCached(client);
    apiMock.deleteChecklist.mockRejectedValueOnce(serverError());
    apiMock.deleteTemplate.mockRejectedValueOnce(serverError());
    apiMock.createChecklist.mockRejectedValueOnce(
      createApiError(409, { error: 'Template belongs to another Organization', code: 'organization_mismatch' }),
    );

    await expect(context.deleteRun('run-1')).rejects.toMatchObject({ status: 500 });
    await expect(context.deleteTemplate('template-1')).rejects.toMatchObject({ status: 500 });
    await expect(context.createRun({ templateId: 'template-1', template })).rejects.toMatchObject({ status: 409 });

    expect(runs.listFetch).not.toHaveBeenCalled();
    expect(templates.listFetch).not.toHaveBeenCalled();
    expect(client.getQueryData<ChecklistTemplate[]>(['templates', 'catalog'])).toHaveLength(2);
    runs.unsubscribe();
    templates.unsubscribe();
  });
});
