import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildTemplateListQueries } from '@/contexts/TemplatesContext';
import {
  createTemplateListFetcher,
  fetchRunList,
  shouldRetryListFetch,
  type TemplateListClient,
} from '@/contexts/templateListFetchers';
import { createApiError } from '@/lib/api-errors';
import type { ApiRun } from '@/lib/schemas/apiRuns';
import type { ApiTemplate } from '@/lib/schemas/apiTemplates';

const templateRow = (id: string, overrides: Partial<ApiTemplate> = {}): ApiTemplate => ({
  id,
  title: `Template ${id}`,
  user_id: 'user-1',
  is_public: 1,
  items: JSON.stringify([{ id: 's1', title: 'Section', items: [{ id: 'i1', title: 'Task' }] }]),
  tags: '["seo"]',
  version: 2,
  ...overrides,
});

const runRow = (id: string, overrides: Partial<ApiRun> = {}): ApiRun => ({
  id,
  title: `Run ${id}`,
  template_id: 'template-1',
  status: 'in_progress',
  user_id: 'user-1',
  items: JSON.stringify([{ id: 's1', title: 'Section', items: [{ id: 'i1', title: 'Task', isCompleted: true }, { id: 'i2', title: 'Task 2' }] }]),
  started_at: '2026-09-01T00:00:00.000Z',
  revision: 3,
  ...overrides,
});

const clientReturning = (templates: ApiTemplate[], runs: ApiRun[] = []): TemplateListClient => ({
  getTemplates: vi.fn(async () => templates),
  getChecklists: vi.fn(async () => runs),
});

const clientFailing = (error: unknown): TemplateListClient => ({
  getTemplates: vi.fn(async () => { throw error; }),
  getChecklists: vi.fn(async () => { throw error; }),
});

const failures: Array<[string, unknown]> = [
  ['a server error', createApiError(500, { error: 'Internal error' })],
  ['an expired session', createApiError(401, { error: 'Unauthorized' })],
  ['a network failure', new TypeError('Failed to fetch')],
];

describe('template and run list fetchers', () => {
  it.each(failures)('reject on %s instead of resolving to an empty list', async (_name, error) => {
    const client = clientFailing(error);

    await expect(createTemplateListFetcher(client)({ scope: 'personal' })()).rejects.toBe(error);
    await expect(fetchRunList(client)).rejects.toBe(error);
  });

  it('keep one malformed run listed with no tasks, so it can still be deleted, instead of emptying the list', async () => {
    const client = clientReturning([], [runRow('good-1'), runRow('bad', { items: '{bad' }), runRow('good-2')]);

    const runs = await fetchRunList(client, 'team-1');

    expect(client.getChecklists).toHaveBeenCalledWith({ teamId: 'team-1' });
    expect(runs.map((run) => [run.id, run.progress, run.revision, run.sections.length])).toEqual([
      ['good-1', 50, 3, 1],
      ['bad', 0, 3, 0],
      ['good-2', 50, 3, 1],
    ]);
  });

  it('skip one malformed template instead of emptying the list', async () => {
    const client = clientReturning([templateRow('good-1'), templateRow('bad', { tags: '[oops' }), templateRow('good-2')]);

    const templates = await createTemplateListFetcher(client)({ scope: 'personal' })();

    expect(templates.map((template) => [template.id, template.tags, template.version])).toEqual([
      ['good-1', ['seo'], 2],
      ['good-2', ['seo'], 2],
    ]);
  });
});

describe('shouldRetryListFetch', () => {
  it('retries a server or network failure once', () => {
    expect(shouldRetryListFetch(0, createApiError(500))).toBe(true);
    expect(shouldRetryListFetch(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetryListFetch(1, createApiError(503))).toBe(false);
  });

  it('does not retry a request the server refused', () => {
    for (const status of [401, 403, 404, 429]) {
      expect(shouldRetryListFetch(0, createApiError(status))).toBe(false);
    }
  });
});

describe('template list queries with a failing API', () => {
  const clients: QueryClient[] = [];
  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
  });

  const observe = (api: TemplateListClient) => {
    const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
    clients.push(client);
    const queries = buildTemplateListQueries({
      ready: true,
      catalogReady: true,
      userId: 'user-1',
      workspaceScopeId: 'personal',
      fetchList: createTemplateListFetcher(api),
    });
    const observer = new QueryObserver(client, queries.workspace);
    const unsubscribe = observer.subscribe(() => {});
    return { client, observer, unsubscribe };
  };

  it('ends in an error, not a cached empty list, after one retry', async () => {
    const api = clientFailing(createApiError(500));
    const { observer, unsubscribe } = observe(api);

    await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe('error'));
    expect(observer.getCurrentResult().data).toBeUndefined();
    expect(api.getTemplates).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('keeps the last good list when a refetch fails', async () => {
    const api = clientReturning([templateRow('kept')]);
    const { observer, unsubscribe } = observe(api);
    await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe('success'));

    vi.mocked(api.getTemplates).mockRejectedValue(createApiError(500));
    await observer.refetch();

    expect(observer.getCurrentResult().isError).toBe(true);
    expect(observer.getCurrentResult().data?.map((template) => template.id)).toEqual(['kept']);
    unsubscribe();
  });
});
