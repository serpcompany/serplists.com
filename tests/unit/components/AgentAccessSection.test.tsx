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
import { createTestQueryClient, seedQueryError } from '../../fixtures/queryClient';

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
  it('does not report "No Run Keys yet." when loading the keys failed', () => {
    const queryClient = createTestQueryClient();
    seedQueryError(queryClient, ['agent-keys']);

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
