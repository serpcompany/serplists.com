import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  AgentAccessSection,
  AgentAccessSectionView,
  type AgentAccessSectionViewProps,
} from '@/components/account/AgentAccessSection';
import { queryKeys } from '@/lib/queryKeys';
import { ACTIVE_AGENT_KEY } from '../../fixtures/agentKeys';
import { createTestQueryClient, seedQueryError } from '../../fixtures/queryClient';

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

const signedInUserAgentKeysKey = queryKeys.agentKeys('user-1');

const activeKey = ACTIVE_AGENT_KEY;

const defaultProps: AgentAccessSectionViewProps = {
  createdKey: null,
  isCreating: false,
  isError: false,
  isLoading: false,
  keys: [],
  keyName: '',
  mcpEndpoint: 'https://demo.serplists.test/api/mcp',
  mcpHostMismatch: false,
  permissions: ['templates:read', 'runs:read', 'runs:write'],
  revokingKeyId: null,
  onCopyEndpoint: vi.fn(),
  onCopySecret: vi.fn(),
  onCreate: vi.fn(),
  onDismissSecret: vi.fn(),
  onKeyNameChange: vi.fn(),
  onPermissionChange: vi.fn(),
  onRetry: vi.fn(),
  onRevoke: vi.fn(),
};

const renderView = (overrides: Partial<AgentAccessSectionViewProps> = {}) =>
  renderToStaticMarkup(<AgentAccessSectionView {...defaultProps} {...overrides} />);

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const PERMISSION_LABELS = ['Read templates', 'Write templates', 'Read runs', 'Write runs'];

function permissionCheckbox(html: string, label: string): string {
  const title = new RegExp(`<div[^>]*id="([^"]+)"[^>]*>${escapeRegExp(label)}</div>`).exec(html);
  expect(title, `the title of ${label}`).not.toBeNull();
  const checkbox = new RegExp(`<button[^>]*aria-labelledby="${title![1]}"[^>]*>`).exec(html);
  expect(checkbox, `the checkbox of ${label}`).not.toBeNull();
  expect(checkbox![0]).toContain('role="checkbox"');
  const id = /\sid="([^"]+)"/.exec(checkbox![0])![1];
  expect(html).toMatch(new RegExp(`<label[^>]*for="${id}"`));
  return checkbox![0];
}

function permissionBadgesUnderKey(html: string, keyName: string): string[] {
  const list = new RegExp(`<ul aria-label="Permissions for ${escapeRegExp(keyName)}"[^>]*>(.*?)</ul>`).exec(html);
  expect(list, `the permissions of ${keyName}`).not.toBeNull();
  return [...list![1].matchAll(/<li[^>]*>([^<]*)<\/li>/g)].map((match) => match[1]);
}

describe('AgentAccessSectionView', () => {
  it('renders the create state with permission choices that default to no template writes', () => {
    const html = renderView({ keyName: 'Codex SOP Runner' });

    expect(html).toContain('Agent Access');
    expect(html).toContain('Create Run Key');
    expect(html).toContain('Permissions are fixed when you create a key');
    expect(html).toContain('No key can delete or publish');
    expect(html).toContain('>Permissions</legend>');
    for (const label of PERMISSION_LABELS) {
      expect(permissionCheckbox(html, label)).toMatch(/aria-describedby="[^"]+"/);
    }
    expect(html).toContain('Never delete or publish.');
    expect(permissionCheckbox(html, 'Write templates')).toContain('aria-checked="false"');
    expect(permissionCheckbox(html, 'Read templates')).toContain('aria-checked="true"');
    expect(permissionCheckbox(html, 'Read runs')).toContain('aria-checked="true"');
    expect(permissionCheckbox(html, 'Write runs')).toContain('aria-checked="true"');
    expect(html).not.toContain('Choose at least one permission.');
    expect(html).toContain('value="Codex SOP Runner"');
    expect(html).toContain('No Run Keys yet.');
    expect(html).toContain('MCP connection');
    expect(html).toContain('https://demo.serplists.test/api/mcp');
    expect(html).toContain('Copy endpoint');
    expect(html).toContain('[mcp_servers.serplists]');
    expect(html).toContain('bearer_token_env_var = &quot;SERPLISTS_RUN_KEY&quot;');
    expect(html).toContain('Claude or another MCP client:');
    expect(html).toContain('Bearer &lt;your Run Key&gt;');
  });

  it('makes each permission checkbox a native button named by its card title, with the whole card as its label, so a tap anywhere on the card toggles it', () => {
    const html = renderView();

    for (const label of PERMISSION_LABELS) {
      expect(permissionCheckbox(html, label)).toMatch(/^<button[^>]*role="checkbox"/);
    }
  });

  it('shows a newly-created secret once with a copy action and recovery warning', () => {
    const html = renderView({
      createdKey: {
        key: activeKey,
        secret: 'slrk_secret_visible_once',
      },
      keys: [activeKey],
    });

    expect(html).toContain('Copy Codex SOP Runner and connect your agent');
    expect(html).toContain('shown once and cannot be recovered');
    expect(html).toContain('SERPLISTS_RUN_KEY');
    expect(html).toContain('slrk_secret_visible_once');
    expect(html).toContain('Copy key');
    expect(html).toContain('I have saved this key');
  });

  it('disables creation when no permission is chosen', () => {
    const html = renderView({ keyName: 'Codex SOP Runner', permissions: [] });
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
    expect(html).toContain('Choose at least one permission.');
    for (const label of PERMISSION_LABELS) {
      expect(permissionCheckbox(html, label)).toContain('aria-checked="false"');
    }
  });

  it('renders active keys as revocable and revoked keys as historical records', () => {
    const html = renderView({
      keys: [
        activeKey,
        {
          ...activeKey,
          id: 'key-2',
          name: 'Old Claude Runner',
          prefix: 'slrk_old123',
          revokedAt: '2026-09-19T02:00:00.000Z',
          status: 'revoked',
        },
      ],
    });

    expect(html).toContain('Codex SOP Runner');
    expect(html).toContain('Active');
    expect(html).toContain('Revoke');
    expect(html).toContain('Old Claude Runner');
    expect(html).toContain('Revoked');
    expect(html).toContain('slrk_demo12...');
    expect(permissionBadgesUnderKey(html, 'Codex SOP Runner')).toEqual(['Read templates', 'Read runs', 'Write runs']);
    expect(permissionBadgesUnderKey(html, 'Old Claude Runner')).toEqual(['Read templates', 'Read runs', 'Write runs']);
    expect(html).not.toContain('slrk_secret_visible_once');
  });

  it('shows a load error with Retry instead of an empty key list when the keys failed to load', () => {
    const html = renderView({ isError: true, keys: undefined });

    expect(html).toContain('load your Run Keys');
    expect(html).toContain('Retry');
    expect(html).not.toContain('No Run Keys yet.');
    expect(html).not.toContain('Loading keys...');
    expect(html).toContain('Create Run Key');
  });

  it('keeps the loaded keys revocable when a later refresh fails', () => {
    const html = renderView({ isError: true, keys: [activeKey] });

    expect(html).toContain('Codex SOP Runner');
    expect(html).toContain('Revoke');
    expect(html).toContain('refresh your Run Keys');
    expect(html).toContain('Retry');
    expect(html).not.toContain('No Run Keys yet.');
  });
});

describe('AgentAccessSection', () => {
  const renderSection = (queryClient: ReturnType<typeof createTestQueryClient>) =>
    renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <AgentAccessSection />
      </QueryClientProvider>,
    );

  it('shows the endpoint the server accepts, not an address outside the MCP host allowlist that the page was opened on', () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(signedInUserAgentKeysKey, []);
    queryClient.setQueryData(['agent-mcp-connection'], {
      mcpEndpoint: 'https://staging.serplists.com/api/mcp',
      hostMismatch: true,
    });

    const html = renderSection(queryClient);

    expect(html).toContain('value="https://staging.serplists.com/api/mcp"');
    expect(html).toContain('url = &quot;https://staging.serplists.com/api/mcp&quot;');
    expect(html).toContain('uses staging.serplists.com');
    expect(html).not.toContain('localhost:8788/api/mcp');
  });

  it('shows the endpoint for the current address without a notice when the server accepts it', () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(signedInUserAgentKeysKey, []);
    queryClient.setQueryData(['agent-mcp-connection'], {
      mcpEndpoint: 'https://staging.serplists.com/api/mcp',
      hostMismatch: false,
    });

    const html = renderSection(queryClient);

    expect(html).toContain('value="https://staging.serplists.com/api/mcp"');
    expect(html).not.toContain('can&#x27;t connect through this address');
  });

  it('says MCP is unavailable instead of showing an endpoint the server rejects', () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(signedInUserAgentKeysKey, []);
    queryClient.setQueryData(['agent-mcp-connection'], { mcpEndpoint: null, hostMismatch: true });

    const html = renderSection(queryClient);

    expect(html).toContain('can&#x27;t connect through this address');
    expect(html).not.toContain('Copy endpoint');
    expect(html).not.toContain('[mcp_servers.serplists]');
    expect(html).not.toContain('/api/mcp');
  });

  it('does not report "No Run Keys yet." when loading the keys failed', () => {
    const queryClient = createTestQueryClient();
    seedQueryError(queryClient, signedInUserAgentKeysKey);

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <AgentAccessSection />
      </QueryClientProvider>,
    );

    expect(html).toContain('load your Run Keys');
    expect(html).toContain('Retry');
    expect(html).not.toContain('No Run Keys yet.');
  });
});
