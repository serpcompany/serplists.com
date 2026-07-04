import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { BillingSection } from '@/components/account/BillingSection';

const workspaceMock = vi.hoisted(() => ({
  value: {
    activeTeamId: undefined as string | undefined,
    isTeamWorkspace: false,
  },
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    user: {
      email: 'john@example.com',
      id: 'user-1',
    },
  }),
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => workspaceMock.value,
}));

vi.mock('@/lib/api', () => ({
  api: {
    createBillingCheckout: vi.fn(),
    createBillingPortal: vi.fn(),
    getBillingStatus: vi.fn().mockResolvedValue({
      billingEnabled: true,
      plan: 'free',
    }),
  },
}));

const renderBillingSection = (billingData: {
  billingEnabled?: boolean;
  plan: 'free' | 'pro' | 'team';
}, teamId?: string) => {
  workspaceMock.value = {
    activeTeamId: teamId,
    isTeamWorkspace: Boolean(teamId),
  };

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(
    ['billing', 'status', 'user-1', teamId ?? 'personal'],
    billingData,
  );

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <BillingSection />
    </QueryClientProvider>,
  );
};

describe('BillingSection', () => {
  it('shows personal self-serve billing actions in a personal workspace', () => {
    const html = renderBillingSection({
      billingEnabled: true,
      plan: 'free',
    });

    expect(html).toContain('Current personal plan');
    expect(html).toContain('Upgrade to Pro');
  });

  it('does not show personal checkout actions in a free team workspace', () => {
    const html = renderBillingSection(
      {
        billingEnabled: true,
        plan: 'free',
      },
      'team-1',
    );

    expect(html).toContain('Current workspace plan');
    expect(html).toContain('Personal subscriptions are managed from your Personal workspace.');
    expect(html).not.toContain('Upgrade to Pro');
    expect(html).not.toContain('Manage subscription');
  });

  it('explains active team entitlements without exposing Stripe actions', () => {
    const html = renderBillingSection(
      {
        billingEnabled: true,
        plan: 'team',
      },
      'team-1',
    );

    expect(html).toContain('Team entitlements apply while this workspace is selected.');
    expect(html).not.toContain('Upgrade to Pro');
    expect(html).not.toContain('Manage subscription');
  });
});
