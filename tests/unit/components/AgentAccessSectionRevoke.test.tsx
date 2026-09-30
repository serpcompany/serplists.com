import React, { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentAccessSection } from '@/components/account/AgentAccessSection';
import type { AgentKey } from '@/lib/api';
import { ApiError } from '@/lib/api-errors';
import { queryKeys } from '@/lib/queryKeys';
import { toast } from 'sonner';

import { click, createFakeContainer, findAll, findByText, installFakeDomGlobals } from '../../fixtures/fakeDom';
import { createTestQueryClient } from '../../fixtures/queryClient';

// A Run Key can be revoked in another tab, or by a revoke whose response was lost. The keys
// list is fresh for 30 seconds, so the page still shows the key Active. When a revoke fails,
// the page must reload the list so the key shows its real state instead of staying Active
// with a Revoke button that fails every time. Drives the real section and React Query
// client; only the API, auth, toasts and the dialog portal are faked.

const apiMocks = vi.hoisted(() => ({
  getAgentKeys: vi.fn(),
  getAgentMcpConnection: vi.fn(),
  revokeAgentKey: vi.fn(),
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  api: apiMocks,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// The confirm dialog renders in a portal on document.body; render it in place so the test
// can press "Revoke key" the way the user confirms.
vi.mock('@/components/ui/alert-dialog', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    AlertDialog: Pass,
    // The trigger renders its `render` element (the Revoke button) around its children.
    AlertDialogTrigger: ({ children, render }: { children?: ReactNode; render?: React.ReactElement }) =>
      render ? React.cloneElement(render, undefined, children) : <>{children}</>,
    AlertDialogContent: Pass,
    AlertDialogHeader: Pass,
    AlertDialogFooter: Pass,
    AlertDialogTitle: Pass,
    AlertDialogDescription: Pass,
    AlertDialogCancel: Pass,
    AlertDialogAction: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    ),
  };
});

const agentKeysKey = queryKeys.agentKeys('user-1');

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
const revokedKey: AgentKey = { ...activeKey, revokedAt: '2026-09-19T02:00:00.000Z', status: 'revoked' };

let restoreGlobals: () => void = () => {};
beforeAll(() => {
  restoreGlobals = installFakeDomGlobals();
});
afterAll(() => restoreGlobals());

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

beforeEach(() => {
  vi.clearAllMocks();
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function openSectionShowing(keys: AgentKey[]) {
  const queryClient = createTestQueryClient();
  // Loaded moments ago, so the 30-second staleTime keeps it from refetching on its own.
  queryClient.setQueryData(agentKeysKey, keys);
  queryClient.setQueryData(['agent-mcp-connection'], {
    mcpEndpoint: 'https://staging.serplists.com/api/mcp',
    hostMismatch: false,
  });
  const container = createFakeContainer();
  root = createRoot(container as unknown as Element);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <AgentAccessSection />
      </QueryClientProvider>,
    );
  });
  await settle();
  return container;
}

const badges = (container: ReturnType<typeof createFakeContainer>) =>
  findAll(container, (node) => node.nodeName === 'SPAN' && ['Active', 'Revoked'].includes(node.textContent)).map(
    (node) => node.textContent,
  );

describe('AgentAccessSection revoke', () => {
  it('reloads the keys when the key was already revoked elsewhere, so it shows Revoked', async () => {
    const container = await openSectionShowing([activeKey]);
    expect(badges(container)).toEqual(['Active']);
    expect(apiMocks.getAgentKeys).not.toHaveBeenCalled();

    apiMocks.revokeAgentKey.mockRejectedValue(
      new ApiError({ status: 404, message: 'Personal run key not found' }),
    );
    apiMocks.getAgentKeys.mockResolvedValue([revokedKey]);

    await act(async () => {
      click(container, findByText(container, 'BUTTON', 'Revoke key'));
    });
    await settle();

    expect(apiMocks.revokeAgentKey).toHaveBeenCalledWith('key-1');
    expect(toast.error).toHaveBeenCalledWith('Personal run key not found');
    expect(apiMocks.getAgentKeys).toHaveBeenCalledOnce();
    expect(badges(container)).toEqual(['Revoked']);
    expect(findAll(container, (node) => node.nodeName === 'BUTTON' && node.textContent === 'Revoke key')).toEqual([]);
  });

  it('reloads the keys when the revoke response was lost', async () => {
    const container = await openSectionShowing([activeKey]);

    apiMocks.revokeAgentKey.mockRejectedValue(new TypeError('Failed to fetch'));
    apiMocks.getAgentKeys.mockResolvedValue([revokedKey]);

    await act(async () => {
      click(container, findByText(container, 'BUTTON', 'Revoke key'));
    });
    await settle();

    expect(toast.error).toHaveBeenCalledWith('Failed to fetch');
    expect(badges(container)).toEqual(['Revoked']);
  });

  it('keeps the revoke error visible when the reload fails too', async () => {
    const container = await openSectionShowing([activeKey]);

    apiMocks.revokeAgentKey.mockRejectedValue(new TypeError('Failed to fetch'));
    apiMocks.getAgentKeys.mockRejectedValue(new TypeError('Failed to fetch keys'));

    await act(async () => {
      click(container, findByText(container, 'BUTTON', 'Revoke key'));
    });
    await settle();

    expect(toast.error).toHaveBeenCalledOnce();
    expect(toast.error).toHaveBeenCalledWith('Failed to fetch');
    expect(findByText(container, 'BUTTON', 'Revoke')).toBeDefined();
  });

  it('shows Revoked after a successful revoke', async () => {
    const container = await openSectionShowing([activeKey]);

    apiMocks.revokeAgentKey.mockResolvedValue({ id: 'key-1', revokedAt: revokedKey.revokedAt });
    apiMocks.getAgentKeys.mockResolvedValue([revokedKey]);

    await act(async () => {
      click(container, findByText(container, 'BUTTON', 'Revoke key'));
    });
    await settle();

    expect(toast.success).toHaveBeenCalledWith('Run Key revoked');
    expect(toast.error).not.toHaveBeenCalled();
    expect(badges(container)).toEqual(['Revoked']);
  });
});
