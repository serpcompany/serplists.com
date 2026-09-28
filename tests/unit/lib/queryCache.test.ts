import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  queryKeys,
  refreshAfterRunRevalidated,
  refreshAfterTemplateArchived,
  refreshAfterTemplateSave,
  refreshRunHistory,
} from '@/lib/queryCache';

const clients: QueryClient[] = [];
const newClient = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
  clients.push(client);
  return client;
};

// An open Changelog: an active query that stays fresh for 60s, like the app default.
const openHistory = async (client: QueryClient, queryKey: readonly unknown[]) => {
  const fetches = vi.fn(async () => ({ fetch: fetches.mock.calls.length }));
  const observer = new QueryObserver(client, { queryKey, queryFn: fetches });
  observer.subscribe(() => {});
  await vi.waitFor(() => expect(fetches).toHaveBeenCalledTimes(1));
  return fetches;
};

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
});

describe('queryKeys', () => {
  it('keeps every Template history key under the prefix that saves refresh', () => {
    expect(queryKeys.templateHistoryFor('t1', 'u1', undefined)).toEqual(['template-history', 't1', 'u1', 'personal']);
    expect(queryKeys.templateHistoryFor('t1', undefined, 'org-1')).toEqual(['template-history', 't1', 'guest', 'org-1']);
    expect(queryKeys.templateHistoryFor('t1').slice(0, 2)).toEqual([...queryKeys.templateHistory('t1')]);
    expect(queryKeys.runHistory('r1')).toEqual(['checklist-run-history', 'r1']);
  });

  it('is the only place the history keys are spelled out', () => {
    const srcDir = path.resolve(__dirname, '../../../src');
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name);
        return statSync(full).isDirectory() ? files(full) : /\.tsx?$/.test(name) ? [full] : [];
      });
    const spelled = files(srcDir)
      .filter((file) => /['"](checklist-run-history|template-history)['"]/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(srcDir, file).split(path.sep).join('/'));

    expect(spelled).toEqual(['lib/queryCache.ts']);
  });
});

// The Changelogs used to keep their first fetch for 60s after every save.
describe('refreshing history after a save', () => {
  it('refetches every open Changelog of a Template after it is saved', async () => {
    const client = newClient();
    const mine = await openHistory(client, queryKeys.templateHistoryFor('t1', 'u1'));
    const organization = await openHistory(client, queryKeys.templateHistoryFor('t1', 'u1', 'org-1'));
    const other = await openHistory(client, queryKeys.templateHistoryFor('t2', 'u1'));

    await refreshAfterTemplateSave(client, 't1');

    await vi.waitFor(() => expect(mine).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(organization).toHaveBeenCalledTimes(2));
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('drops the Changelog of an archived Template instead of refetching it', async () => {
    const client = newClient();
    const key = queryKeys.templateHistoryFor('t1', 'u1');
    client.setQueryData(key, { versions: [] });

    await refreshAfterTemplateArchived(client, 't1');

    expect(client.getQueryData(key)).toBeUndefined();
  });

  it('refetches the run Changelog after a run save or revalidate', async () => {
    const client = newClient();
    const history = await openHistory(client, queryKeys.runHistory('r1'));

    await refreshRunHistory(client, 'r1');
    await vi.waitFor(() => expect(history).toHaveBeenCalledTimes(2));

    await refreshAfterRunRevalidated(client, 'r1');
    await vi.waitFor(() => expect(history).toHaveBeenCalledTimes(3));
  });
});
