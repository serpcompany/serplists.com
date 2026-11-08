import { navigation } from '../../support/mockedNextNavigation';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { createApiError } from '@/lib/api-errors';
import type { BillingStatus } from '@/lib/billing';
import Pricing from '@/views/Pricing';
import { createTestQueryClient, seedQueryError } from '../../fixtures/queryClient';
import { pressTheButton } from '../../support/pressTheButton';
import { renderSettled, theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';

const visitor = vi.hoisted(() => ({ user: null as { id: string; email: string } | null }));

vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => visitor }));
vi.mock('@/lib/api', () => ({ api: { createBillingCheckout: vi.fn(), getBillingStatus: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

theInMemoryBrowserAsTheWindow();

const BILLING_STATUS_KEY = ['billing', 'status', 'user-1', 'personal'];
const UPGRADE = 'Upgrade — $9/month';
const freePlan: BillingStatus = { plan: 'free', billingEnabled: true, subscriptionStatus: null };

beforeEach(() => {
  visitor.user = { id: 'user-1', email: 'john@example.com' };
  vi.mocked(api.createBillingCheckout).mockReset();
  vi.mocked(api.getBillingStatus).mockReset().mockResolvedValue(freePlan);
  vi.mocked(toast.error).mockClear();
});

afterEach(() => cleanup());

const openPricing = async (billing: BillingStatus | 'failed' = freePlan) => {
  const queryClient = createTestQueryClient();
  if (billing === 'failed') seedQueryError(queryClient, BILLING_STATUS_KEY);
  else {
    queryClient.setQueryData(BILLING_STATUS_KEY, billing);
    vi.mocked(api.getBillingStatus).mockResolvedValue(billing);
  }
  navigation.reset('/pricing/');
  await renderSettled(
    <QueryClientProvider client={queryClient}>
      <Pricing />
    </QueryClientProvider>,
  );
  vi.mocked(api.getBillingStatus).mockClear();
};

describe('Pricing Pro plan action', () => {
  it('asks a visitor who is not signed in to get started by signing up', async () => {
    visitor.user = null;
    await openPricing();

    expect(screen.getByRole('link', { name: 'Get Started' }).getAttribute('href')).toBe('/register/');
    expect(screen.queryByRole('button', { name: UPGRADE })).toBeNull();
  });

  it('says the upgrade is unavailable while billing is off', async () => {
    await openPricing({ ...freePlan, billingEnabled: false });

    expect(screen.getByRole('button', { name: 'Upgrade unavailable' }).hasAttribute('disabled')).toBe(true);
  });

  it('checks the plan again when the user presses Retry after the check failed', async () => {
    await openPricing('failed');

    await pressTheButton('Retry');

    await waitFor(() => expect(api.getBillingStatus).toHaveBeenCalledTimes(1));
  });
});

describe('Pricing upgrade', () => {
  it('opens Stripe Checkout and says so until the page leaves', async () => {
    vi.mocked(api.createBillingCheckout).mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/test' });
    await openPricing();

    await pressTheButton(UPGRADE);

    expect(navigation.documentLoads).toEqual([{ kind: 'assign', href: 'https://checkout.stripe.com/c/pay/test' }]);
    expect(screen.getByRole('button', { name: 'Opening checkout...' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows why checkout did not open and offers the upgrade again', async () => {
    vi.mocked(api.createBillingCheckout).mockRejectedValue(new Error('Stripe is unavailable'));
    await openPricing();

    await pressTheButton(UPGRADE);

    expect(toast.error).toHaveBeenCalledWith('Stripe is unavailable');
    expect(screen.getByRole('button', { name: UPGRADE }).hasAttribute('disabled')).toBe(false);
    expect(api.getBillingStatus).not.toHaveBeenCalled();
  });

  it('says checkout failed when the failure carries no message', async () => {
    vi.mocked(api.createBillingCheckout).mockRejectedValue('offline');
    await openPricing();

    await pressTheButton(UPGRADE);

    expect(toast.error).toHaveBeenCalledWith('Failed to start checkout');
  });

  it.each([
    ['an open subscription', createApiError(409, { error: 'You already have a subscription.', code: 'already_subscribed' })],
    ['a plan support manages', createApiError(403, { error: 'Your plan is managed by support.', code: 'plan_managed_by_support' })],
  ])('checks the plan again when checkout is refused for %s, since the plan is not what the page showed', async (_case, refusal) => {
    vi.mocked(api.createBillingCheckout).mockRejectedValue(refusal);
    await openPricing();

    await pressTheButton(UPGRADE);

    expect(toast.error).toHaveBeenCalledWith(refusal.message);
    await waitFor(() => expect(api.getBillingStatus).toHaveBeenCalledTimes(1));
  });
});
