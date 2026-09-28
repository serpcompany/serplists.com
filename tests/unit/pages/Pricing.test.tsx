import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import Pricing from '@/pages/Pricing';

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { email: 'john@example.com', id: 'user-1' } }),
}));

vi.mock('@/lib/api', () => ({
  api: {
    createBillingCheckout: vi.fn(),
    getBillingStatus: vi.fn(),
  },
}));

const renderPricing = (billingData: Record<string, unknown>) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['billing', 'status', 'user-1', 'personal'], billingData);

  return renderToStaticMarkup(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <Pricing />
      </QueryClientProvider>
    </MemoryRouter>,
  );
};

describe('Pricing', () => {
  it('offers the upgrade to a Free user with no subscription', () => {
    const html = renderPricing({ plan: 'free', billingEnabled: true, subscriptionStatus: null });

    expect(html).toContain('Upgrade — $9/month');
  });

  it('sends a past-due subscriber to manage the subscription instead of upgrading again', () => {
    const html = renderPricing({
      plan: 'free',
      billingEnabled: true,
      subscriptionStatus: 'past_due',
      canManageBilling: true,
    });

    expect(html).not.toContain('Upgrade — $9/month');
    expect(html).toContain('Manage subscription');
  });

  it('links a Pro user to manage Pro', () => {
    const html = renderPricing({ plan: 'pro', billingEnabled: true, subscriptionStatus: 'active' });

    expect(html).toContain('Manage Pro');
    expect(html).toContain('href="/dashboard/settings"');
    expect(html).not.toContain('Upgrade — $9/month');
  });

  it('does not link Pro granted by support to a portal that cannot open', () => {
    const html = renderPricing({
      plan: 'pro',
      billingEnabled: true,
      subscriptionStatus: null,
      canManageBilling: false,
      managedBySupport: true,
    });

    expect(html).not.toContain('Manage Pro');
    expect(html).not.toContain('Upgrade — $9/month');
    expect(html).toContain('Your plan is managed by support.');
  });

  it('does not offer the upgrade when support manages the plan', () => {
    const html = renderPricing({
      plan: 'free',
      billingEnabled: true,
      subscriptionStatus: null,
      managedBySupport: true,
    });

    expect(html).not.toContain('Upgrade — $9/month');
    expect(html).toContain('Your plan is managed by support.');
  });
});
