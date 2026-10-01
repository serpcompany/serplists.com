import { useState, type FormEvent } from 'react';
import { Bot, Copy, KeyRound, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item';
import { QueryListState } from '@/components/shared/QueryListState';
import { useRunKeys } from '@/features/agent-access/useRunKeys';
import type { AgentKey, CreatedAgentKey } from '@/lib/api';
import { copyTextToClipboard } from '@/lib/clipboard';
import {
  DEFAULT_RUN_KEY_PERMISSIONS,
  RUN_KEY_PERMISSION_DETAILS,
  RUN_KEY_PERMISSIONS,
  toggleRunKeyPermission,
  type RunKeyPermission,
} from '@/lib/schemas/runKeyPermissions';

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
  mcpEndpoint: string | null;
  mcpHostMismatch: boolean;
  permissions: readonly RunKeyPermission[];
  revokingKeyId: string | null;
  onCopyEndpoint: () => void;
  onCopySecret: () => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onDismissSecret: () => void;
  onKeyNameChange: (name: string) => void;
  onPermissionChange: (permission: RunKeyPermission, enabled: boolean) => void;
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
  permissions,
  revokingKeyId,
  onCopyEndpoint,
  onCopySecret,
  onCreate,
  onDismissSecret,
  onKeyNameChange,
  onPermissionChange,
  onRetry,
  onRevoke,
}: AgentAccessSectionViewProps) {
  const [revokeDialogKeyId, setRevokeDialogKeyId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Agent Access</CardTitle>
        <CardDescription>
          Create a personal Run Key for a code agent to work with your Personal templates and runs.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Alert>
          <Bot />
          <AlertTitle>Permissions are fixed when you create a key</AlertTitle>
          <AlertDescription>
            To change what an agent can do, create a new key and revoke the old one. No key can delete or publish
            templates, change your profile, access Organizations, or manage billing.
          </AlertDescription>
        </Alert>

        <form onSubmit={onCreate}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="agent-key-name">Key name</FieldLabel>
              <Input
                id="agent-key-name"
                value={keyName}
                onChange={(event) => onKeyNameChange(event.target.value)}
                placeholder="Codex SOP Runner"
                maxLength={80}
                autoComplete="off"
              />
            </Field>
            <FieldSet>
              <FieldLegend variant="label">Permissions</FieldLegend>
              <FieldGroup className="grid gap-3 sm:grid-cols-2">
                {RUN_KEY_PERMISSIONS.map((permission) => {
                  const id = `run-key-permission-${permission.replace(':', '-')}`;
                  const details = RUN_KEY_PERMISSION_DETAILS[permission];
                  return (
                    <FieldLabel htmlFor={id} key={permission}>
                      <Field orientation="horizontal">
                        <Checkbox
                          nativeButton
                          render={<button type="button" />}
                          id={id}
                          aria-labelledby={`${id}-title`}
                          aria-describedby={`${id}-description`}
                          checked={permissions.includes(permission)}
                          onCheckedChange={(checked) => onPermissionChange(permission, checked === true)}
                        />
                        <FieldContent>
                          <FieldTitle id={`${id}-title`}>{details.label}</FieldTitle>
                          <FieldDescription id={`${id}-description`}>{details.description}</FieldDescription>
                        </FieldContent>
                      </Field>
                    </FieldLabel>
                  );
                })}
              </FieldGroup>
              {permissions.length === 0 ? (
                <FieldDescription>Choose at least one permission.</FieldDescription>
              ) : null}
            </FieldSet>
            <Field orientation="horizontal">
              <Button type="submit" disabled={isCreating || !keyName.trim() || permissions.length === 0}>
                <KeyRound data-icon="inline-start" />
                {isCreating ? 'Creating...' : 'Create Run Key'}
              </Button>
            </Field>
          </FieldGroup>
        </form>

        {createdKey ? (
          <Alert data-testid="created-agent-key">
            <TriangleAlert />
            <AlertTitle>Copy {createdKey.key.name} and connect your agent</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <p>
                This secret is shown once and cannot be recovered. Store it as{' '}
                <code className="font-mono">SERPLISTS_RUN_KEY</code>, then use the MCP connection below.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  aria-label="New Run Key secret"
                  className="font-mono text-xs"
                  value={createdKey.secret}
                  readOnly
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button className="sm:shrink-0" type="button" variant="outline" onClick={onCopySecret}>
                  <Copy data-icon="inline-start" />
                  Copy key
                </Button>
              </div>
              <div>
                <Button type="button" size="sm" variant="ghost" onClick={onDismissSecret}>
                  I have saved this key
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        <Card size="sm">
          <CardHeader>
            <CardTitle>MCP connection</CardTitle>
            {mcpEndpoint ? (
              <CardDescription>
                Add this Streamable HTTP server to Codex, Claude, or another MCP client.
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {mcpHostMismatch ? (
              <Alert>
                <TriangleAlert />
                <AlertDescription>
                  {mcpEndpoint
                    ? `Agents can't connect through this address, so this endpoint uses ${hostOf(mcpEndpoint)}.`
                    : "Agents can't connect through this address. Open Agent Access from this site's main address to get the MCP endpoint."}
                </AlertDescription>
              </Alert>
            ) : null}
            {mcpEndpoint ? (
              <>
                <Field>
                  <FieldLabel htmlFor="agent-mcp-endpoint">Endpoint</FieldLabel>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="agent-mcp-endpoint"
                      aria-label="SERP Lists MCP endpoint"
                      className="font-mono text-xs"
                      value={mcpEndpoint}
                      readOnly
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <Button className="sm:shrink-0" type="button" variant="outline" onClick={onCopyEndpoint}>
                      <Copy data-icon="inline-start" />
                      Copy endpoint
                    </Button>
                  </div>
                </Field>
                <div className="flex flex-col gap-2 text-xs text-muted-foreground">
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
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
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
              <Empty className="border p-4">
                <EmptyDescription>No Run Keys yet.</EmptyDescription>
              </Empty>
            }
          >
            <ItemGroup className="gap-2">
              {(keys ?? []).map((key) => {
                const isActive = key.status === 'active';
                return (
                  <Item key={key.id} role="listitem" variant="outline">
                    <ItemContent className="min-w-0">
                      <ItemTitle className="flex-wrap wrap-anywhere">
                        {key.name}
                        <Badge variant={isActive ? 'default' : 'secondary'}>
                          {isActive ? 'Active' : 'Revoked'}
                        </Badge>
                      </ItemTitle>
                      <ItemDescription className="font-mono text-xs">{key.prefix}...</ItemDescription>
                      <ul aria-label={`Permissions for ${key.name}`} className="flex flex-wrap gap-1">
                        {key.permissions.map((permission) => (
                          <Badge key={permission} render={<li />} variant="outline">
                            {RUN_KEY_PERMISSION_DETAILS[permission]?.label ?? permission}
                          </Badge>
                        ))}
                      </ul>
                      <ItemDescription className="text-xs">
                        Created {formatTimestamp(key.createdAt)} · Last used {formatTimestamp(key.lastUsedAt)}
                      </ItemDescription>
                    </ItemContent>

                    {isActive ? (
                      <ItemActions>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={revokingKeyId === key.id}
                          onClick={() => setRevokeDialogKeyId(key.id)}
                        >
                          <Trash2 data-icon="inline-start" />
                          {revokingKeyId === key.id ? 'Revoking...' : 'Revoke'}
                        </Button>
                        <ConfirmDialog
                          confirmLabel="Revoke key"
                          description="The agent will immediately lose access. This action cannot be undone, but its run history will be preserved."
                          onConfirm={() => {
                            setRevokeDialogKeyId(null);
                            onRevoke(key);
                          }}
                          onOpenChange={(open) => setRevokeDialogKeyId(open ? key.id : null)}
                          open={revokeDialogKeyId === key.id}
                          title={`Revoke ${key.name}?`}
                        />
                      </ItemActions>
                    ) : null}
                  </Item>
                );
              })}
            </ItemGroup>
          </QueryListState>
        </div>
      </CardContent>
    </Card>
  );
}

const listingNewKeyFirst = (newKey: AgentKey) => (keys: AgentKey[] = []) => [
  newKey,
  ...keys.filter((key) => key.id !== newKey.id),
];

export function AgentAccessSection() {
  const [keyName, setKeyName] = useState('');
  const [permissions, setPermissions] = useState<RunKeyPermission[]>([...DEFAULT_RUN_KEY_PERMISSIONS]);
  const [createdKey, setCreatedKey] = useState<CreatedAgentKey | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);
  const { keysQuery, mcpEndpoint, mcpHostMismatch, createKey, revokeKey, reloadKeys } = useRunKeys();

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = keyName.trim();
    if (!name) return;

    setIsCreating(true);
    try {
      const result = await createKey(name, permissions);
      setCreatedKey(result);
      setKeyName('');
      setPermissions([...DEFAULT_RUN_KEY_PERMISSIONS]);
      await reloadKeys(listingNewKeyFirst(result.key));
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
      await revokeKey(key.id);
      if (createdKey?.key.id === key.id) setCreatedKey(null);
      await reloadKeys();
      toast.success('Run Key revoked');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to revoke Run Key');
      await reloadKeys().catch(() => {});
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
      permissions={permissions}
      revokingKeyId={revokingKeyId}
      onCopyEndpoint={handleCopyEndpoint}
      onCopySecret={handleCopySecret}
      onCreate={handleCreate}
      onDismissSecret={() => setCreatedKey(null)}
      onKeyNameChange={setKeyName}
      onPermissionChange={(permission, enabled) =>
        setPermissions((current) => toggleRunKeyPermission(current, permission, enabled))}
      onRetry={() => void keysQuery.refetch()}
      onRevoke={handleRevoke}
    />
  );
}
