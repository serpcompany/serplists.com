import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  AgentAccessSectionView,
  type AgentAccessSectionViewProps,
} from '@/components/account/AgentAccessSection';
import type { AgentKey } from '@/lib/api';

const activeKey: AgentKey = {
  id: 'key-1',
  name: 'Codex SOP Runner',
  prefix: 'slrk_demo12',
  createdAt: '2026-09-19T01:00:00.000Z',
  lastUsedAt: null,
  revokedAt: null,
  permissions: ['templates:read', 'runs:read', 'runs:write'],
  status: 'active',
};

const defaultProps: AgentAccessSectionViewProps = {
  createdKey: null,
  isCreating: false,
  isLoading: false,
  keys: [],
  keyName: '',
  mcpEndpoint: 'https://demo.serplists.test/api/mcp',
  permissions: ['templates:read', 'runs:read', 'runs:write'],
  revokingKeyId: null,
  onCopyEndpoint: vi.fn(),
  onCopySecret: vi.fn(),
  onCreate: vi.fn(),
  onDismissSecret: vi.fn(),
  onKeyNameChange: vi.fn(),
  onPermissionChange: vi.fn(),
  onRevoke: vi.fn(),
};

const renderView = (overrides: Partial<AgentAccessSectionViewProps> = {}) =>
  renderToStaticMarkup(<AgentAccessSectionView {...defaultProps} {...overrides} />);

describe('AgentAccessSectionView', () => {
  it('renders the create state with permission choices that default to no template writes', () => {
    const html = renderView({ keyName: 'Codex SOP Runner' });

    expect(html).toContain('Agent Access');
    expect(html).toContain('Create Run Key');
    expect(html).toContain('Permissions are fixed when you create a key');
    expect(html).toContain('No key can delete or publish');
    for (const label of ['Read templates', 'Write templates', 'Read runs', 'Write runs']) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).toMatch(/aria-checked="false"[^>]*aria-label="Write templates"|aria-label="Write templates"[^>]*aria-checked="false"/);
    expect(html).toMatch(/aria-checked="true"[^>]*aria-label="Read templates"|aria-label="Read templates"[^>]*aria-checked="true"/);
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

  it('disables creation when no permission is chosen', () => {
    const html = renderView({ keyName: 'Codex SOP Runner', permissions: [] });
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
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
    expect(html).toContain('Codex SOP Runner permissions');
    expect(html).toContain('Write runs');
    expect(html).not.toContain('slrk_secret_visible_once');
  });
});
