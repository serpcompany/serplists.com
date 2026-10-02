import { openAndConfirm, theDialogsToClose } from '../../support/confirmDialogs';
import React, { act } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSettled } from '../../support/renderInTheDom';

import { AgentAccessSection } from '@/components/account/AgentAccessSection';
import type { AgentKey } from '@/lib/api';
import { ApiError } from '@/lib/api-errors';
import { queryKeys } from '@/lib/queryKeys';
import { toast } from 'sonner';

import { ACTIVE_AGENT_KEY } from '../../fixtures/agentKeys';
import { createTestQueryClient } from '../../fixtures/queryClient';

const apiMocks = vi.hoisted(() => ({
  getAgentKeys: vi.fn(),
  getAgentMcpConnection: vi.fn(),
  revokeAgentKey: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  api: apiMocks,
}));

const signedInUserAgentKeysKey = queryKeys.agentKeys('user-1');

const activeKey = ACTIVE_AGENT_KEY;
const revokedKey: AgentKey = { ...activeKey, revokedAt: '2026-09-19T02:00:00.000Z', status: 'revoked' };

beforeEach(() => {
  vi.clearAllMocks();
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function openSectionWithKeysLoadedMomentsAgo(keys: AgentKey[]) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(signedInUserAgentKeysKey, keys);
  queryClient.setQueryData(['agent-mcp-connection'], {
    mcpEndpoint: 'https://staging.serplists.com/api/mcp',
    hostMismatch: false,
  });
  await renderSettled(
    <QueryClientProvider client={queryClient}>
      <AgentAccessSection />
    </QueryClientProvider>,
  );
  await settle();
}

const badges = () => screen.queryAllByText(/^(Active|Revoked)$/).map((badge) => badge.textContent);

const buttonsNamed = (name: string) => screen.queryAllByRole('button', { name });

async function revokeAndConfirm() {
  await openAndConfirm('Revoke', 'Revoke key');
  await theDialogsToClose();
  await settle();
}

describe('AgentAccessSection revoke of a key the 30-second fresh list still shows Active', () => {
  it('reloads the keys when the key was already revoked elsewhere, so it shows Revoked with no Revoke button that fails every time', async () => {
    await openSectionWithKeysLoadedMomentsAgo([activeKey]);
    expect(badges()).toEqual(['Active']);
    expect(apiMocks.getAgentKeys).not.toHaveBeenCalled();

    apiMocks.revokeAgentKey.mockRejectedValue(
      new ApiError({ status: 404, message: 'Personal run key not found' }),
    );
    apiMocks.getAgentKeys.mockResolvedValue([revokedKey]);

    await revokeAndConfirm();

    expect(apiMocks.revokeAgentKey).toHaveBeenCalledWith('key-1');
    expect(toast.error).toHaveBeenCalledWith('Personal run key not found');
    expect(apiMocks.getAgentKeys).toHaveBeenCalledOnce();
    expect(badges()).toEqual(['Revoked']);
    expect(buttonsNamed('Revoke key')).toEqual([]);
    expect(buttonsNamed('Revoke')).toEqual([]);
  });

  it('reloads the keys when the revoke response was lost', async () => {
    await openSectionWithKeysLoadedMomentsAgo([activeKey]);

    apiMocks.revokeAgentKey.mockRejectedValue(new TypeError('Failed to fetch'));
    apiMocks.getAgentKeys.mockResolvedValue([revokedKey]);

    await revokeAndConfirm();

    expect(toast.error).toHaveBeenCalledWith('Failed to fetch');
    expect(badges()).toEqual(['Revoked']);
  });

  it('keeps the revoke error visible when the reload fails too', async () => {
    await openSectionWithKeysLoadedMomentsAgo([activeKey]);

    apiMocks.revokeAgentKey.mockRejectedValue(new TypeError('Failed to fetch'));
    apiMocks.getAgentKeys.mockRejectedValue(new TypeError('Failed to fetch keys'));

    await revokeAndConfirm();

    expect(toast.error).toHaveBeenCalledOnce();
    expect(toast.error).toHaveBeenCalledWith('Failed to fetch');
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeDefined();
  });

  it('shows Revoked after a successful revoke', async () => {
    await openSectionWithKeysLoadedMomentsAgo([activeKey]);

    apiMocks.revokeAgentKey.mockResolvedValue({ id: 'key-1', revokedAt: revokedKey.revokedAt });
    apiMocks.getAgentKeys.mockResolvedValue([revokedKey]);

    await revokeAndConfirm();

    expect(toast.success).toHaveBeenCalledWith('Run Key revoked');
    expect(toast.error).not.toHaveBeenCalled();
    expect(badges()).toEqual(['Revoked']);
  });
});
