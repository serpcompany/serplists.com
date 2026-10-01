import type { QueryClient, QueryKey } from '@tanstack/react-query';

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

export const queryKindPrefix = (kind: keyof typeof queryKeys): QueryKey => [queryKeys[kind]('', '')[0]];

const isPublicCatalogKey = (queryKey: QueryKey): boolean =>
  queryKey[0] === 'templates' && queryKey[1] === 'catalog';

export const isUserSwitch = (previousUserId: string | null, nextUserId: string | null): boolean =>
  previousUserId !== null && previousUserId !== nextUserId;

export const removeSignedOutUserQueries = (queryClient: QueryClient): void => {
  queryClient.removeQueries({
    predicate: (query) => query.getObserversCount() === 0 && !isPublicCatalogKey(query.queryKey),
  });
};
