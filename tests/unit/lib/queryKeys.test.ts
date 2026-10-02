import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isUserSwitch, queryKeys, removeSignedOutUserQueries } from '@/lib/queryKeys';

const clients: QueryClient[] = [];
const newClient = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return client;
};

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
});

describe('private query keys', () => {
  it('give each user their own cache entry', () => {
    const builders = [
      (userId: string) => queryKeys.incomingTeamInvites(userId),
      (userId: string) => queryKeys.agentKeys(userId),
      (userId: string) => queryKeys.teamMembers(userId, 'team-1'),
      (userId: string) => queryKeys.teamInvites(userId, 'team-1'),
      (userId: string) => queryKeys.teamActivity(userId, 'team-1'),
      (userId: string) => queryKeys.archivedTemplates(userId, 'personal'),
      (userId: string) => queryKeys.archivedRuns(userId, 'personal'),
    ];
    for (const build of builders) {
      expect(build('user-a')[1]).toBe('user-a');
      expect(build('user-a')).not.toEqual(build('user-b'));
    }
  });

  it('are only spelled out in src/lib/queryKeys.ts', () => {
    const srcRoot = path.resolve(__dirname, '../../../src');
    const listFiles = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) return listFiles(full);
        return /\.(ts|tsx)$/.test(entry) ? [full] : [];
      });
    const kinds = Object.values(queryKeys).map((build) => build('user', 'scope')[0]);
    const offenders = listFiles(srcRoot)
      .filter((file) => path.relative(srcRoot, file) !== path.join('lib', 'queryKeys.ts'))
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        return kinds
          .filter((kind) => new RegExp(`['"\`]${kind}['"\`]`).test(source))
          .map((kind) => `${path.relative(srcRoot, file)} spells out '${kind}'; use queryKeys from @/lib/queryKeys`);
      });
    expect(offenders).toEqual([]);
  });
});

describe('isUserSwitch', () => {
  it('is true on sign-out and on a change to another user', () => {
    expect(isUserSwitch('user-a', null)).toBe(true);
    expect(isUserSwitch('user-a', 'user-b')).toBe(true);
  });

  it('is false for the first session restore, a sign-in after sign-out, and the same user', () => {
    expect(isUserSwitch(null, 'user-a')).toBe(false);
    expect(isUserSwitch(null, null)).toBe(false);
    expect(isUserSwitch('user-a', 'user-a')).toBe(false);
  });
});

describe('removeSignedOutUserQueries', () => {
  it('drops what the previous user loaded but keeps the public catalog and mounted queries', async () => {
    const client = newClient();
    client.setQueryData(queryKeys.incomingTeamInvites('user-a'), [{ teamName: 'Acme Corp' }]);
    client.setQueryData(['runs', 'user-a', 'personal'], [{ id: 'run-a' }]);
    client.setQueryData(['teams', 'user-a'], [{ id: 'team-a' }]);
    client.setQueryData(['templates', 'catalog'], [{ id: 'public-1' }]);
    const current = new QueryObserver(client, {
      queryKey: queryKeys.incomingTeamInvites('user-b'),
      queryFn: async () => [{ teamName: 'Bravo Inc' }],
    });
    const unsubscribe = current.subscribe(() => {});
    await vi.waitFor(() => expect(client.getQueryData(queryKeys.incomingTeamInvites('user-b'))).toBeDefined());

    removeSignedOutUserQueries(client);

    expect(client.getQueryCache().getAll().map((query) => query.queryKey)).toEqual([
      ['templates', 'catalog'],
      queryKeys.incomingTeamInvites('user-b'),
    ]);
    unsubscribe();
  });

  it('does not let a response that arrives after the switch write the previous user\'s data back', async () => {
    const client = newClient();
    let respond: (value: unknown[]) => void = () => {};
    const pending = client.fetchQuery({
      queryKey: queryKeys.agentKeys('user-a'),
      queryFn: () => new Promise<unknown[]>((resolve) => { respond = resolve; }),
    }).catch(() => 'cancelled');

    removeSignedOutUserQueries(client);
    respond([{ name: 'Prod SOP bot' }]);

    await expect(pending).resolves.toBe('cancelled');
    expect(client.getQueryData(queryKeys.agentKeys('user-a'))).toBeUndefined();
  });
});
