import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  AgentAccessSection,
  AgentAccessSectionView,
  type AgentAccessSectionViewProps,
} from '@/components/account/AgentAccessSection';
import type { AgentKey } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { createTestQueryClient, seedQueryError } from '../../fixtures/queryClient';

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

// The keys are cached per signed-in user.
const agentKeysKey = queryKeys.agentKeys('user-1');

const activeKey: AgentKey = {
  id: 'key-1',
  name: 'Codex SOP Runner',
  prefix: 'slrk_demo12',
  createdAt: '2026-09-19T01:00:00.000Z',
  lastUsedAt: null,
  revokedAt: null,
  status: 'active',
};

const defaultProps: AgentAccessSectionViewProps = {
  createdKey: null,
  isCreating: false,
  isError: false,
  isLoading: false,
  keys: [],
  keyName: '',
  mcpEndpoint: 'https://demo.serplists.test/api/mcp',
  mcpHostMismatch: false,
  revokingKeyId: null,
  onCopyEndpoint: vi.fn(),
  onCopySecret: vi.fn(),
  onCreate: vi.fn(),
  onDismissSecret: vi.fn(),
  onKeyNameChange: vi.fn(),
  onRetry: vi.fn(),
  onRevoke: vi.fn(),
};

const renderView = (overrides: Partial<AgentAccessSectionViewProps> = {}) =>
  renderToStaticMarkup(<AgentAccessSectionView {...defaultProps} {...overrides} />);

describe('AgentAccessSectionView', () => {
  it('renders the create state with the fixed personal run permissions', () => {
    const html = renderView({ keyName: 'Codex SOP Runner' });

    expect(html).toContain('Agent Access');
    expect(html).toContain('Create Run Key');
    expect(html).toContain('read personal templates');
    expect(html).toContain('list, start, read, and update personal runs');
    expect(html).toContain('cannot edit');
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

  it('shows the endpoint the server accepts, not the address the page was opened on', () => {
    // A per-deployment URL such as https://3f2a1b9c.serp-checklists.pages.dev is not on the
    // MCP host allowlist, so the server points agents at the canonical staging address.
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(agentKeysKey, []);
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
    queryClient.setQueryData(agentKeysKey, []);
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
    queryClient.setQueryData(agentKeysKey, []);
    queryClient.setQueryData(['agent-mcp-connection'], { mcpEndpoint: null, hostMismatch: true });

    const html = renderSection(queryClient);

    expect(html).toContain('can&#x27;t connect through this address');
    expect(html).not.toContain('Copy endpoint');
    expect(html).not.toContain('[mcp_servers.serplists]');
    expect(html).not.toContain('/api/mcp');
  });

  it('does not report "No Run Keys yet." when loading the keys failed', () => {
    const queryClient = createTestQueryClient();
    seedQueryError(queryClient, agentKeysKey);

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
