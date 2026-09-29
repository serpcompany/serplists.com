import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import DashboardSettings from '@/views/DashboardSettings';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

const refreshProfile = vi.fn();
const updateUser = vi.fn();

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    user: {
      email: 'john@example.com',
      id: 'user-1',
      image: 'https://example.com/avatar.png',
      name: 'John Doe',
      username: 'johndoe',
    },
    refreshProfile,
  }),
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeTeamId: undefined,
    activeWorkspace: {
      id: 'personal',
      name: 'Personal',
      role: 'owner',
      type: 'personal',
    },
    canManageTeam: false,
    createTeam: vi.fn(),
    isTeamWorkspace: false,
    refreshTeams: vi.fn(),
  }),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: vi.fn().mockResolvedValue({
      data: {
        user: {
          email: 'john@example.com',
          image: 'https://example.com/avatar.png',
          name: 'John Doe',
          username: 'johndoe',
        },
      },
    }),
    changePassword: vi.fn(),
    revokeOtherSessions: vi.fn(),
    updateUser: (...args: unknown[]) => updateUser(...args),
  },
}));

vi.mock('@/lib/api', () => ({
  getAgentMcpEndpoint: () => 'http://localhost:8788/api/mcp',
  api: {
    createAgentKey: vi.fn(),
    createBillingCheckout: vi.fn(),
    createBillingPortal: vi.fn(),
    getAgentKeys: vi.fn().mockResolvedValue([]),
    getBillingStatus: vi.fn().mockResolvedValue({
      billingEnabled: false,
      plan: 'free',
    }),
    revokeAgentKey: vi.fn(),
    uploadToR2: vi.fn(),
  },
}));

describe('DashboardSettings page', () => {
  it('reuses the real account settings surface instead of fake settings-only panels', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    navigation.reset('/dashboard/settings');
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <DashboardSettings />
      </QueryClientProvider>,
    );

    expect(html).toContain('Account Settings');
    expect(html).toContain('data-dashboard-content-shell="true"');
    expect(html).toContain('data-dashboard-page-header="true"');
    expect(html).toContain('Profile Information');
    expect(html).toContain('Billing');
    expect(html).toContain('Security');
    expect(html).toContain('john@example.com');
    expect(html).toContain('John Doe');
    expect(html).toContain('Update Profile');
    expect(html).not.toContain('New Template');
    expect(html).not.toContain('Import Template');
    expect(html).not.toContain('Notifications');
    expect(html).not.toContain('Privacy');
    expect(html).not.toContain('Email Notifications');
    expect(html).not.toContain('Privacy Settings');
    expect(html).not.toContain('Export Data');
    expect(html).not.toContain('Danger Zone');
  });
});
