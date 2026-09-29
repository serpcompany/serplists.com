import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Copy, KeyRound, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { QueryListState } from '@/components/shared/QueryListState';
import { api, getAgentMcpEndpoint, type AgentKey, type CreatedAgentKey } from '@/lib/api';
import { copyTextToClipboard } from '@/lib/clipboard';
import { queryKeys } from '@/lib/queryKeys';
import { reloadQuery } from '@/lib/queryReload';

const agentMcpConnectionQueryKey = ['agent-mcp-connection'] as const;

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const formatTimestamp = (value: string | null): string => {
  if (!value) return 'Never';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

export type AgentAccessSectionViewProps = {
  createdKey: CreatedAgentKey | null;
  isCreating: boolean;
  isError: boolean;
  isLoading: boolean;
  keys: AgentKey[] | undefined;
  keyName: string;
  // Null when agents cannot connect from this deployment at all.
  mcpEndpoint: string | null;
  // The page's address is not one the MCP server accepts (for example a per-deployment URL).
  mcpHostMismatch: boolean;
  revokingKeyId: string | null;
  onCopyEndpoint: () => void;
  onCopySecret: () => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onDismissSecret: () => void;
  onKeyNameChange: (name: string) => void;
  onRetry: () => void;
  onRevoke: (key: AgentKey) => void;
};

export function AgentAccessSectionView({
  createdKey,
  isCreating,
  isError,
  isLoading,
  keys,
  keyName,
  mcpEndpoint,
  mcpHostMismatch,
  revokingKeyId,
  onCopyEndpoint,
  onCopySecret,
  onCreate,
  onDismissSecret,
  onKeyNameChange,
  onRetry,
  onRevoke,
}: AgentAccessSectionViewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Agent Access
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Create a personal Run Key for a code agent to operate SOP runs in Personal.
          </p>
          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <p className="font-medium">Fixed run-only permissions</p>
            <p className="mt-1 text-muted-foreground">
              The key can read personal templates and list, start, read, and update personal runs. It cannot edit
              templates, change your profile, access Organizations, or manage billing.
            </p>
          </div>
        </div>

        <form className="space-y-3" onSubmit={onCreate}>
          <div className="space-y-2">
            <Label htmlFor="agent-key-name">Key name</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="agent-key-name"
                value={keyName}
                onChange={(event) => onKeyNameChange(event.target.value)}
                placeholder="Codex SOP Runner"
                maxLength={80}
                autoComplete="off"
              />
              <Button type="submit" disabled={isCreating || !keyName.trim()}>
                <KeyRound className="mr-2 h-4 w-4" />
                {isCreating ? 'Creating...' : 'Create Run Key'}
              </Button>
            </div>
          </div>
        </form>

        {createdKey ? (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4" data-testid="created-agent-key">
            <div className="flex gap-3">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className="font-medium">Copy {createdKey.key.name} and connect your agent</p>
                  <p className="text-sm text-muted-foreground">
                    This secret is shown once and cannot be recovered. Store it as{' '}
                    <code className="font-mono">SERPLISTS_RUN_KEY</code>, then use the MCP connection below.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    aria-label="New Run Key secret"
                    className="font-mono text-xs"
                    value={createdKey.secret}
                    readOnly
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <Button type="button" variant="outline" onClick={onCopySecret}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy key
                  </Button>
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={onDismissSecret}>
                  I have saved this key
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="space-y-3 rounded-lg border p-4">
          <div>
            <h3 className="text-sm font-medium">MCP connection</h3>
            {mcpEndpoint ? (
              <p className="text-xs text-muted-foreground">
                Add this Streamable HTTP server to Codex, Claude, or another MCP client.
              </p>
            ) : null}
          </div>
          {mcpHostMismatch ? (
            <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
              {mcpEndpoint
                ? `Agents can't connect through this address, so this endpoint uses ${hostOf(mcpEndpoint)}.`
                : "Agents can't connect through this address. Open Agent Access from this site's main address to get the MCP endpoint."}
            </p>
          ) : null}
          {mcpEndpoint ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="agent-mcp-endpoint">Endpoint</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="agent-mcp-endpoint"
                    aria-label="SERP Lists MCP endpoint"
                    className="font-mono text-xs"
                    value={mcpEndpoint}
                    readOnly
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <Button type="button" variant="outline" onClick={onCopyEndpoint}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy endpoint
                  </Button>
                </div>
              </div>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Codex:</span> set the copied secret in the{' '}
                  <code className="font-mono">SERPLISTS_RUN_KEY</code> environment variable, then add this to{' '}
                  <code className="font-mono">~/.codex/config.toml</code>:
                </p>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs text-foreground"><code>{`[mcp_servers.serplists]
url = "${mcpEndpoint}"
bearer_token_env_var = "SERPLISTS_RUN_KEY"`}</code></pre>
                <p>
                  <span className="font-medium text-foreground">Claude or another MCP client:</span> choose Streamable
                  HTTP, use the endpoint above, and set the Authorization header to{' '}
                  <code className="font-mono">Bearer &lt;your Run Key&gt;</code>.
                </p>
              </div>
            </>
          ) : null}
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-medium">Personal Run Keys</h3>
            <p className="text-xs text-muted-foreground">
              Revoking a key immediately blocks future agent requests. Existing run history remains intact.
            </p>
          </div>

          <QueryListState
            query={{ data: keys, isError, isLoading }}
            loadingLabel="Loading keys..."
            loadErrorLabel="Couldn't load your Run Keys."
            refreshErrorLabel="Couldn't refresh your Run Keys. Showing the last loaded list."
            onRetry={onRetry}
            empty={
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No Run Keys yet.
              </div>
            }
          >
            <div className="divide-y rounded-lg border">
              {(keys ?? []).map((key) => {
                const isActive = key.status === 'active';
                return (
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" key={key.id}>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{key.name}</span>
                        <Badge variant={isActive ? 'success' : 'secondary'}>
                          {isActive ? 'Active' : 'Revoked'}
                        </Badge>
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">{key.prefix}...</p>
                      <p className="text-xs text-muted-foreground">
                        Created {formatTimestamp(key.createdAt)} · Last used {formatTimestamp(key.lastUsedAt)}
                      </p>
                    </div>

                    {isActive ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button type="button" size="sm" variant="outline" disabled={revokingKeyId === key.id}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            {revokingKeyId === key.id ? 'Revoking...' : 'Revoke'}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Revoke {key.name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              The agent will immediately lose access. This action cannot be undone, but its run
                              history will be preserved.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => onRevoke(key)}
                            >
                              Revoke key
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </QueryListState>
        </div>
      </CardContent>
    </Card>
  );
}

export function AgentAccessSection() {
  const [keyName, setKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<CreatedAgentKey | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const userId = useAuth().user?.id;
  const keysQuery = useQuery({
    queryKey: queryKeys.agentKeys(userId),
    queryFn: () => api.getAgentKeys(),
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
  });
  // The server knows which hosts its MCP check accepts; until it answers, assume this one.
  const connectionQuery = useQuery({
    queryKey: agentMcpConnectionQueryKey,
    queryFn: () => api.getAgentMcpConnection(),
    staleTime: Infinity,
  });
  const mcpEndpoint = connectionQuery.data
    ? connectionQuery.data.mcpEndpoint
    : getAgentMcpEndpoint(typeof window === 'undefined' ? undefined : window.location.origin);
  const mcpHostMismatch = connectionQuery.data?.hostMismatch ?? false;

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = keyName.trim();
    if (!name) return;

    setIsCreating(true);
    try {
      const result = await api.createAgentKey(name);
      setCreatedKey(result);
      setKeyName('');
      // Show the new key at once; the list may still be loading from before the create.
      await reloadQuery<AgentKey[]>(queryClient, queryKeys.agentKeys(userId), (keys = []) => [
        result.key,
        ...keys.filter((key) => key.id !== result.key.id),
      ]);
      toast.success('Run Key created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create Run Key');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopySecret = async () => {
    if (!createdKey) return;

    const copied = await copyTextToClipboard(createdKey.secret);
    if (copied) {
      toast.success('Run Key copied');
    } else {
      toast.error('Could not copy the key. Select and copy it manually.');
    }
  };

  const handleCopyEndpoint = async () => {
    if (!mcpEndpoint) return;

    const copied = await copyTextToClipboard(mcpEndpoint);
    if (copied) {
      toast.success('MCP endpoint copied');
    } else {
      toast.error('Could not copy the endpoint. Select and copy it manually.');
    }
  };

  const handleRevoke = async (key: AgentKey) => {
    setRevokingKeyId(key.id);
    try {
      await api.revokeAgentKey(key.id);
      if (createdKey?.key.id === key.id) setCreatedKey(null);
      await reloadQuery(queryClient, queryKeys.agentKeys(userId));
      toast.success('Run Key revoked');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to revoke Run Key');
      // The key may already be revoked (the response was lost, or another tab revoked it):
      // show its real state instead of a stale Active row.
      await reloadQuery(queryClient, queryKeys.agentKeys(userId)).catch(() => {});
    } finally {
      setRevokingKeyId(null);
    }
  };

  return (
    <AgentAccessSectionView
      createdKey={createdKey}
      isCreating={isCreating}
      isError={keysQuery.isError}
      isLoading={keysQuery.isLoading}
      keys={keysQuery.data}
      keyName={keyName}
      mcpEndpoint={mcpEndpoint}
      mcpHostMismatch={mcpHostMismatch}
      revokingKeyId={revokingKeyId}
      onCopyEndpoint={handleCopyEndpoint}
      onCopySecret={handleCopySecret}
      onCreate={handleCreate}
      onDismissSecret={() => setCreatedKey(null)}
      onKeyNameChange={setKeyName}
      onRetry={() => void keysQuery.refetch()}
      onRevoke={handleRevoke}
    />
  );
}
