import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  createBillingCheckout: vi.fn(),
  createBillingPortal: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({ error: vi.fn(), message: vi.fn() }));

vi.mock('@/lib/api', () => ({ api: apiMocks }));
vi.mock('sonner', () => ({ toast: toastMocks }));

import { createApiError } from '@/lib/api-errors';
import { startBillingCheckout } from '@/lib/access-flow';

describe('startBillingCheckout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', { location: { href: 'https://serplists.test/pricing' } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('redirects to Stripe Checkout when a checkout session is created', async () => {
    apiMocks.createBillingCheckout.mockResolvedValueOnce({ url: 'https://checkout.stripe.test/cs_1' });

    await expect(startBillingCheckout(true)).resolves.toBe(true);

    expect(window.location.href).toBe('https://checkout.stripe.test/cs_1');
  });

  it('starts one checkout when it is asked again while the first is still starting', async () => {
    let finish: (value: { url: string }) => void = () => {};
    apiMocks.createBillingCheckout.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));

    const first = startBillingCheckout(true);
    const second = startBillingCheckout(true);
    finish({ url: 'https://checkout.stripe.test/cs_1' });

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(apiMocks.createBillingCheckout).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe('https://checkout.stripe.test/cs_1');
  });

  it('lets the user try again after a checkout fails', async () => {
    apiMocks.createBillingCheckout.mockRejectedValueOnce(new Error('Failed to start checkout'));
    apiMocks.createBillingCheckout.mockResolvedValueOnce({ url: 'https://checkout.stripe.test/cs_2' });

    await expect(startBillingCheckout(true)).resolves.toBe(false);
    await expect(startBillingCheckout(true)).resolves.toBe(true);

    expect(apiMocks.createBillingCheckout).toHaveBeenCalledTimes(2);
  });

  it('opens the Customer Portal when the subscription needs attention', async () => {
    apiMocks.createBillingCheckout.mockRejectedValueOnce(createApiError(409, {
      error: 'Your Pro subscription needs attention.',
      code: 'subscription_needs_attention',
    }));
    apiMocks.createBillingPortal.mockResolvedValueOnce({ url: 'https://billing.stripe.test/p_1' });

    await startBillingCheckout(true);

    expect(apiMocks.createBillingPortal).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe('https://billing.stripe.test/p_1');
    expect(toastMocks.message).toHaveBeenCalledWith('Your Pro subscription needs attention.');
  });

  it('shows the error when the Customer Portal cannot open', async () => {
    apiMocks.createBillingCheckout.mockRejectedValueOnce(createApiError(409, {
      error: 'Your Pro subscription needs attention.',
      code: 'subscription_needs_attention',
    }));
    apiMocks.createBillingPortal.mockRejectedValueOnce(new Error('No Stripe customer found for user'));

    await expect(startBillingCheckout(true)).resolves.toBe(false);

    expect(toastMocks.error).toHaveBeenCalledWith('Your Pro subscription needs attention.');
    expect(window.location.href).toBe('https://serplists.test/pricing');
  });
});
