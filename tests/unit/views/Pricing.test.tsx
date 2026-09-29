import React from 'react';
import { QueryClient, QueryClientProvider, type UseQueryOptions } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { PLAN_UNKNOWN_MESSAGE, shouldRetryBillingStatus } from '@/lib/billing';
import Pricing from '@/views/Pricing';
import { createTestQueryClient, seedQueryError } from '../../fixtures/queryClient';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

const queryOptionsSeen = vi.fn();

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: (options: UseQueryOptions, client?: QueryClient) => {
      queryOptionsSeen(options);
      return actual.useQuery(options, client);
    },
  };
});

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { email: 'john@example.com', id: 'user-1' } }),
}));

vi.mock('@/lib/api', () => ({
  api: {
    createBillingCheckout: vi.fn(),
    getBillingStatus: vi.fn(),
  },
}));

const BILLING_STATUS_KEY = ['billing', 'status', 'user-1', 'personal'];

const renderWithClient = (queryClient: QueryClient) => {
  navigation.reset('/pricing/');
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Pricing />
    </QueryClientProvider>,
  );
};

const renderPricing = (billingData: Record<string, unknown>) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(BILLING_STATUS_KEY, billingData);

  navigation.reset('/pricing/');
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Pricing />
    </QueryClientProvider>,
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
    expect(html).toContain('href="/dashboard/settings/"');
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

  // A failed status is unknown, not Free: Pro, past-due and support-managed users must not
  // be offered a checkout the server refuses.
  it('offers a retry, not the upgrade, when the plan could not be checked', () => {
    const queryClient = createTestQueryClient();
    seedQueryError(queryClient, BILLING_STATUS_KEY);

    const html = renderWithClient(queryClient);

    expect(html).not.toContain('Upgrade');
    expect(html).not.toContain('Manage Pro');
    expect(html).not.toContain('Manage subscription');
    expect(html).toContain(PLAN_UNKNOWN_MESSAGE.replace("'", '&#x27;'));
    expect(html).toContain('Retry');
    expect(html).toContain('role="alert"');
  });

  it('keeps the known action when only a background refresh of the plan failed', () => {
    const queryClient = createTestQueryClient();
    seedQueryError(queryClient, BILLING_STATUS_KEY, {
      plan: 'pro',
      billingEnabled: true,
      subscriptionStatus: 'active',
    });

    const html = renderWithClient(queryClient);

    expect(html).toContain('Manage Pro');
    expect(html).not.toContain('Upgrade — $9/month');
    expect(html).not.toContain(PLAN_UNKNOWN_MESSAGE.replace("'", '&#x27;'));
  });

  it('shows the plan check, not the upgrade, while the status loads', () => {
    const html = renderWithClient(createTestQueryClient());

    expect(html).toContain('Checking plan...');
    expect(html).not.toContain('Upgrade — $9/month');
  });

  it('retries a transient billing status failure before calling the plan unknown', () => {
    queryOptionsSeen.mockClear();
    renderPricing({ plan: 'free', billingEnabled: true, subscriptionStatus: null });

    const billingQuery = queryOptionsSeen.mock.calls
      .map(([options]) => options as UseQueryOptions)
      .find((options) => JSON.stringify(options.queryKey) === JSON.stringify(BILLING_STATUS_KEY));
    expect(billingQuery?.retry).toBe(shouldRetryBillingStatus);
  });
});
