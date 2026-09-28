import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  createBillingCheckout: vi.fn(),
  createBillingPortal: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({ error: vi.fn(), message: vi.fn(), success: vi.fn() }));

vi.mock('@/lib/api', () => ({ api: apiMocks }));
vi.mock('sonner', () => ({ toast: toastMocks }));

import {
  ORGANIZATION_UPGRADE_MESSAGE,
  handleUpgradeRequiredForContext,
  startBillingCheckout,
} from '@/lib/access-flow';
import { BILLING_UNAVAILABLE_MESSAGE, createApiError } from '@/lib/api-errors';

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

  it('explains an unfinished earlier checkout without opening the Customer Portal', async () => {
    apiMocks.createBillingCheckout.mockRejectedValueOnce(createApiError(409, {
      error: 'Your previous checkout has not finished yet. Try again later.',
      code: 'checkout_incomplete',
    }));

    await expect(startBillingCheckout(true)).resolves.toBe(false);

    expect(apiMocks.createBillingPortal).not.toHaveBeenCalled();
    expect(toastMocks.error).toHaveBeenCalledWith('Your previous checkout has not finished yet. Try again later.');
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

describe('handleUpgradeRequiredForContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', { location: { href: 'http://localhost/dashboard/templates' } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts a Personal checkout in the Personal context', async () => {
    apiMocks.createBillingCheckout.mockResolvedValueOnce({ url: 'https://checkout.example/session' });

    const redirecting = await handleUpgradeRequiredForContext({
      billingEnabled: true,
      isTeamWorkspace: false,
    });

    expect(apiMocks.createBillingCheckout).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe('https://checkout.example/session');
    expect(toastMocks.error).not.toHaveBeenCalled();
    expect(redirecting).toBe(true);
  });

  it('shows the Organization plan message and never starts a Personal checkout', async () => {
    const redirecting = await handleUpgradeRequiredForContext({
      billingEnabled: true,
      isTeamWorkspace: true,
    });

    expect(apiMocks.createBillingCheckout).not.toHaveBeenCalled();
    expect(toastMocks.error).toHaveBeenCalledTimes(1);
    expect(toastMocks.error).toHaveBeenCalledWith(ORGANIZATION_UPGRADE_MESSAGE);
    expect(ORGANIZATION_UPGRADE_MESSAGE).toBe(
      'This Organization needs a paid plan before using this feature.',
    );
    expect(redirecting).toBe(false);
  });

  it('reports billing as unavailable once when billing is disabled', async () => {
    const redirecting = await handleUpgradeRequiredForContext({
      billingEnabled: false,
      isTeamWorkspace: false,
    });

    expect(apiMocks.createBillingCheckout).not.toHaveBeenCalled();
    expect(toastMocks.error).toHaveBeenCalledTimes(1);
    expect(toastMocks.error).toHaveBeenCalledWith(BILLING_UNAVAILABLE_MESSAGE);
    expect(redirecting).toBe(false);
  });
});
