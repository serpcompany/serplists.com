import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
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
  subscriptionStatus?: string | null;
  canManageBilling?: boolean;
  managedBySupport?: boolean;
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
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <BillingSection />
      </QueryClientProvider>
    </MemoryRouter>,
  );
};

describe('BillingSection', () => {
  it('shows personal self-serve billing actions in a personal workspace', () => {
    const html = renderBillingSection({
      billingEnabled: true,
      plan: 'free',
    });

    expect(html).toContain('Current Personal plan');
    expect(html).toContain('Upgrade to Pro — $9/month');
  });

  it('sends a past-due subscriber to Manage subscription instead of a second checkout', () => {
    const html = renderBillingSection({
      billingEnabled: true,
      plan: 'free',
      subscriptionStatus: 'past_due',
      canManageBilling: true,
    });

    expect(html).toContain('Your last Pro payment failed.');
    expect(html).toContain('Manage subscription');
    expect(html).not.toContain('Upgrade to Pro');
  });

  it('sends a subscriber whose subscription is not paid up to Manage subscription', () => {
    const html = renderBillingSection({
      billingEnabled: true,
      plan: 'free',
      subscriptionStatus: 'paused',
      canManageBilling: true,
    });

    expect(html).toContain('Your Pro subscription needs attention');
    expect(html).toContain('Manage subscription');
    expect(html).not.toContain('Upgrade to Pro');
  });

  it('does not offer checkout when support manages the plan', () => {
    const html = renderBillingSection({
      billingEnabled: true,
      plan: 'free',
      subscriptionStatus: null,
      canManageBilling: false,
      managedBySupport: true,
    });

    expect(html).toContain('Your plan is managed by support. Contact support to change it.');
    expect(html).not.toContain('Upgrade to Pro');
    expect(html).not.toContain('Manage subscription');
  });

  it('keeps the portal for an existing customer when support manages the plan', () => {
    const html = renderBillingSection({
      billingEnabled: true,
      plan: 'free',
      subscriptionStatus: 'active',
      canManageBilling: true,
      managedBySupport: true,
    });

    expect(html).toContain('Your plan is managed by support.');
    expect(html).toContain('Manage subscription');
    expect(html).not.toContain('Upgrade to Pro');
  });

  it('does not offer a portal that cannot open to Pro granted by support', () => {
    const html = renderBillingSection({
      billingEnabled: true,
      plan: 'pro',
      subscriptionStatus: null,
      canManageBilling: false,
      managedBySupport: true,
    });

    expect(html).toContain('Your plan is managed by support. Contact support to change it.');
    expect(html).not.toContain('Manage subscription');
    expect(html).not.toContain('Upgrade to Pro');
  });

  it('keeps the portal for a Pro subscriber', () => {
    const html = renderBillingSection({
      billingEnabled: true,
      plan: 'pro',
      subscriptionStatus: 'active',
      canManageBilling: true,
      managedBySupport: false,
    });

    expect(html).toContain('Manage subscription');
    expect(html).not.toContain('managed by support');
  });

  it('does not show personal checkout actions in a free team workspace', () => {
    const html = renderBillingSection(
      {
        billingEnabled: true,
        plan: 'free',
      },
      'team-1',
    );

    expect(html).toContain('Current Organization plan');
    expect(html).toContain('Personal subscriptions are managed from Personal.');
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

    expect(html).toContain('Paid Organization entitlements apply while this Organization is selected.');
    expect(html).not.toContain('Upgrade to Pro');
    expect(html).not.toContain('Manage subscription');
  });
});
