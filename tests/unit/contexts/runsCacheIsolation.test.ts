import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { refreshRunLists } from '@/contexts/templateListCache';

type Run = { id: string; owner: string };

const clients: QueryClient[] = [];

// The provider builds its runs queryFn from the render's `user`, while the server answers for
// whoever holds the session cookie. This mirrors that: the closure names a user, the "server"
// returns the runs of the current session.
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const session = { userId: 'user-a' };
  const getChecklists = vi.fn(async (): Promise<Run[]> => [{ id: `${session.userId}-run`, owner: session.userId }]);
  const runsQuery = (userId: string) => ({
    queryKey: ['runs', userId, 'personal'],
    queryFn: async () => (userId ? getChecklists() : []),
    staleTime: 5 * 60 * 1000,
  });
  return { client, session, getChecklists, runsQuery };
}

describe('runs cache isolation across a user switch', () => {
  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
  });

  it('never refetches the previous user\'s unobserved runs list with the new session', async () => {
    const { client, session, getChecklists, runsQuery } = setup();

    // User A opens the runs page, then signs out: the key stays cached with no observers.
    const pageA = new QueryObserver(client, runsQuery('user-a'));
    const unsubscribeA = pageA.subscribe(() => {});
    await vi.waitFor(() => expect(client.getQueryData(['runs', 'user-a', 'personal'])).toBeDefined());
    unsubscribeA();

    // User B signs in on the same tab and has the runs page open.
    session.userId = 'user-b';
    const pageB = new QueryObserver(client, runsQuery('user-b'));
    const unsubscribeB = pageB.subscribe(() => {});
    await vi.waitFor(() => expect(client.getQueryData(['runs', 'user-b', 'personal'])).toBeDefined());
    getChecklists.mockClear();

    // B starts or revalidates a run.
    await refreshRunLists(client);

    expect(client.getQueryData(['runs', 'user-a', 'personal'])).toEqual([{ id: 'user-a-run', owner: 'user-a' }]);
    expect(getChecklists).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['runs', 'user-b', 'personal'])).toEqual([{ id: 'user-b-run', owner: 'user-b' }]);
    // The inactive key is only marked stale, so it refetches under its own user when mounted again.
    expect(client.getQueryState(['runs', 'user-a', 'personal'])?.isInvalidated).toBe(true);
    unsubscribeB();
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

// Returns the argument text of each call, balancing parentheses.
function callArguments(source: string, callee: string): string[] {
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
      callArguments(readFileSync(file, 'utf8'), 'refetchQueries')
        .filter((args) => !/type:\s*['"]active['"]/.test(args))
        .map((args) => `${path.relative(SRC_ROOT, file)}: refetchQueries(${args.trim()})`),
    );
    expect(offenders, 'Use invalidateQueries, or refetchQueries({ ..., type: "active" })').toEqual([]);
  });
});
