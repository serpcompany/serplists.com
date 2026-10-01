import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { refreshRunLists } from '@/contexts/templateListCache';

type Run = { id: string; owner: string };

const clients: QueryClient[] = [];

function tabSharingOneSessionCookie() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const sessionCookie = { userId: 'user-a' };
  const serverAnsweringForTheCookie = vi.fn(async (): Promise<Run[]> => [
    { id: `${sessionCookie.userId}-run`, owner: sessionCookie.userId },
  ]);
  const runsQueryAsTheProviderRendersItFor = (userId: string) => ({
    queryKey: ['runs', userId, 'personal'],
    queryFn: async () => (userId ? serverAnsweringForTheCookie() : []),
    staleTime: 5 * 60 * 1000,
  });
  const openRunsPageAs = async (userId: string) => {
    const page = new QueryObserver(client, runsQueryAsTheProviderRendersItFor(userId));
    const leave = page.subscribe(() => {});
    await vi.waitFor(() => expect(client.getQueryData(['runs', userId, 'personal'])).toBeDefined());
    return leave;
  };
  const signInOnTheSameTabAs = (userId: string) => {
    sessionCookie.userId = userId;
  };
  return { client, serverAnsweringForTheCookie, openRunsPageAs, signInOnTheSameTabAs };
}

describe('runs cache isolation across a user switch', () => {
  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
  });

  it("never refetches the previous user's unobserved runs list with the new session, and leaves it stale to refetch under its own user", async () => {
    const tab = tabSharingOneSessionCookie();
    const leaveRunsPageAndSignOut = await tab.openRunsPageAs('user-a');
    leaveRunsPageAndSignOut();
    tab.signInOnTheSameTabAs('user-b');
    const leaveRunsPageOfUserB = await tab.openRunsPageAs('user-b');
    tab.serverAnsweringForTheCookie.mockClear();

    await refreshRunLists(tab.client);

    expect(tab.client.getQueryData(['runs', 'user-a', 'personal'])).toEqual([{ id: 'user-a-run', owner: 'user-a' }]);
    expect(tab.serverAnsweringForTheCookie).toHaveBeenCalledTimes(1);
    expect(tab.client.getQueryData(['runs', 'user-b', 'personal'])).toEqual([{ id: 'user-b-run', owner: 'user-b' }]);
    expect(tab.client.getQueryState(['runs', 'user-a', 'personal'])?.isInvalidated).toBe(true);
    leaveRunsPageOfUserB();
  });
});

const SRC_ROOT = path.resolve(__dirname, '../../../src');

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return listSourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

function argumentTextOfEachCall(source: string, callee: string): string[] {
  const calls: string[] = [];
  let index = source.indexOf(`${callee}(`);
  while (index !== -1) {
    const start = index + callee.length + 1;
    let depth = 1;
    let end = start;
    while (end < source.length && depth > 0) {
      if (source[end] === '(') depth += 1;
      if (source[end] === ')') depth -= 1;
      end += 1;
    }
    calls.push(source.slice(start, end - 1));
    index = source.indexOf(`${callee}(`, end);
  }
  return calls;
}

describe('query refetch guard', () => {
  it('only refetches active queries, because inactive keys may belong to a signed-out user', () => {
    const offenders = listSourceFiles(SRC_ROOT).flatMap((file) =>
      argumentTextOfEachCall(readFileSync(file, 'utf8'), 'refetchQueries')
        .filter((args) => !/type:\s*['"]active['"]/.test(args))
        .map((args) => `${path.relative(SRC_ROOT, file)}: refetchQueries(${args.trim()})`),
    );
    expect(offenders, 'Use invalidateQueries, or refetchQueries({ ..., type: "active" })').toEqual([]);
  });
});
