import { useQuery, useQueryClient, type Updater } from '@tanstack/react-query';

import { useAuth } from '@/contexts/CloudflareAuthContext';
import { api, getAgentMcpEndpoint, type AgentKey, type CreatedAgentKey } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { reloadQuery } from '@/lib/queryReload';
import type { RunKeyPermission } from '@/lib/schemas/runKeyPermissions';

const agentMcpConnectionQueryKey = ['agent-mcp-connection'] as const;

export function useRunKeys() {
  const queryClient = useQueryClient();
  const userId = useAuth().user?.id;
  const keysQuery = useQuery({
    queryKey: queryKeys.agentKeys(userId),
    queryFn: () => api.getAgentKeys(),
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
  });
  const connectionQuery = useQuery({
    queryKey: agentMcpConnectionQueryKey,
    queryFn: () => api.getAgentMcpConnection(),
    staleTime: Infinity,
  });
  const mcpEndpoint = connectionQuery.data
    ? connectionQuery.data.mcpEndpoint
    : getAgentMcpEndpoint(typeof window === 'undefined' ? undefined : window.location.origin);

  return {
    keysQuery,
    mcpEndpoint,
    mcpHostMismatch: connectionQuery.data?.hostMismatch ?? false,
    createKey: (name: string, permissions: RunKeyPermission[]): Promise<CreatedAgentKey> =>
      api.createAgentKey(name, permissions),
    revokeKey: (keyId: string) => api.revokeAgentKey(keyId),
    reloadKeys: (update?: Updater<AgentKey[] | undefined, AgentKey[] | undefined>) =>
      reloadQuery<AgentKey[]>(queryClient, queryKeys.agentKeys(userId), update),
  };
}
