import type { QueryClient, QueryKey } from '@tanstack/react-query';

// Query keys for data that belongs to the signed-in user. Each key starts with its kind and
// then the user id, so two people who sign in on the same tab never read each other's cache
// entries. Build these keys here; tests/unit/lib/queryKeys.test.ts fails on inline copies.
// Give every query that uses one `enabled: Boolean(userId)`.
type UserId = string | null | undefined;

const userKey = (userId: UserId): string => userId || 'signed-out';

export const queryKeys = {
  incomingTeamInvites: (userId: UserId) => ['incoming-team-invites', userKey(userId)] as const,
  agentKeys: (userId: UserId) => ['agent-keys', userKey(userId)] as const,
  teamMembers: (userId: UserId, teamId?: string) => ['team-members', userKey(userId), teamId ?? 'none'] as const,
  teamInvites: (userId: UserId, teamId?: string) => ['team-invites', userKey(userId), teamId ?? 'none'] as const,
  teamActivity: (userId: UserId, teamId?: string) => ['team-activity', userKey(userId), teamId ?? 'none'] as const,
  archivedTemplates: (userId: UserId, scopeId: string) => ['archived-templates', userKey(userId), scopeId] as const,
  archivedRuns: (userId: UserId, scopeId: string) => ['archived-runs', userKey(userId), scopeId] as const,
};

// Matches every key of one kind, for all users and contexts. Use it only to mark a kind stale
// (invalidateQueries): inactive keys then refetch under their own user when a page reads them.
export const queryKindPrefix = (kind: keyof typeof queryKeys): QueryKey => [queryKeys[kind]('', '')[0]];

// The public catalog is the same for every visitor, so it survives a change of user.
const isSharedQueryKey = (queryKey: QueryKey): boolean =>
  queryKey[0] === 'templates' && queryKey[1] === 'catalog';

// True when the settled session moved from one user to another user or to signed out. The
// first session restore after a page load is not a switch: nothing private is cached yet.
export const isUserSwitch = (previousUserId: string | null, nextUserId: string | null): boolean =>
  previousUserId !== null && previousUserId !== nextUserId;

// Drops every cached query that no mounted component reads, except shared public data. Run it
// once the app has rendered for the new user: the new user's pages then observe their own keys,
// so every unobserved entry was loaded for the previous user. Removing a query also cancels its
// fetch, so a late response for the previous user cannot write its data back.
export const removeSignedOutUserQueries = (queryClient: QueryClient): void => {
  queryClient.removeQueries({
    predicate: (query) => query.getObserversCount() === 0 && !isSharedQueryKey(query.queryKey),
  });
};
