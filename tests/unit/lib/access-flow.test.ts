import { QueryClient, QueryObserver } from '@tanstack/react-query';
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
  handleAccessFailure,
  handleUpgradeRequiredForContext,
  refreshBillingStatusOnCheckoutConflict,
  startBillingCheckout,
} from '@/lib/access-flow';
import { BILLING_UNAVAILABLE_MESSAGE, createApiError } from '@/lib/api-errors';
import { getBillingStatusQueryKey } from '@/lib/billing';

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

// Template import and export await a request and then handle its failure. A checkout
// or sign-in redirect for that failure ran even after the user had left the page.
describe('handleAccessFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', {
      location: {
        href: 'http://localhost/dashboard/runs',
        pathname: '/dashboard/import-templates',
        search: '?billing=success',
        hash: '#export',
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts checkout for a plan gate while the user is still on the page', async () => {
    apiMocks.createBillingCheckout.mockResolvedValueOnce({ url: 'https://checkout.example/session' });

    await handleAccessFailure(createApiError(403, { error: 'Upgrade required', code: 'upgrade_required' }), {
      fallbackMessage: 'Failed to import templates',
      isCurrent: () => true,
    });

    expect(apiMocks.createBillingCheckout).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe('https://checkout.example/session');
  });

  it('does not start checkout once the user has left the page', async () => {
    await handleAccessFailure(createApiError(403, { error: 'Upgrade required', code: 'upgrade_required' }), {
      fallbackMessage: 'Failed to import templates',
      isCurrent: () => false,
    });

    expect(apiMocks.createBillingCheckout).not.toHaveBeenCalled();
    expect(window.location.href).toBe('http://localhost/dashboard/runs');
    expect(toastMocks.error).toHaveBeenCalledWith('Upgrade required');
  });

  it('does not go to sign-in once the user has left the page', async () => {
    const navigate = vi.fn();

    await handleAccessFailure(createApiError(401, { error: 'Unauthorized' }), {
      fallbackMessage: 'Failed to export templates',
      isCurrent: () => false,
      navigate,
    });

    expect(navigate).not.toHaveBeenCalled();
    expect(toastMocks.error).toHaveBeenCalledTimes(1);
  });

  it('goes to sign-in while the user is still on the page', async () => {
    const navigate = vi.fn();

    await handleAccessFailure(createApiError(401, { error: 'Unauthorized' }), {
      fallbackMessage: 'Failed to export templates',
      isCurrent: () => true,
      navigate,
    });

    // Back to this page, with its query and hash, after sign-in.
    expect(navigate).toHaveBeenCalledWith(
      '/login?next=%2Fdashboard%2Fimport-templates%3Fbilling%3Dsuccess%23export',
    );
  });
});

// Checkout asks Stripe, so it can find a subscription (or a plan support manages) that the
// cached billing status does not show yet. Every page that starts checkout through here
// gates Pro features on that cached plan, so the plan must be reloaded, or each click asks
// for checkout again.
describe('refreshBillingStatusOnCheckoutConflict', () => {
  const personalKey = getBillingStatusQueryKey('user-1', null);
  const organizationKey = getBillingStatusQueryKey('user-1', 'team-1');
  let client: QueryClient;
  let stopRefreshing: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', { location: { href: 'http://localhost/dashboard/import-templates' } });
    client = new QueryClient();
    client.setQueryData(personalKey, { plan: 'free' });
    client.setQueryData(organizationKey, { plan: 'team' });
    stopRefreshing = refreshBillingStatusOnCheckoutConflict(client);
  });

  afterEach(() => {
    stopRefreshing();
    client.clear();
    vi.unstubAllGlobals();
  });

  const conflict = (code: string, status = 409) =>
    createApiError(status, { error: 'You already have Pro.', code });

  it('reloads the plan a page shows when checkout finds an existing subscription', async () => {
    apiMocks.createBillingCheckout.mockRejectedValueOnce(conflict('already_subscribed'));
    const statusFetch = vi.fn().mockResolvedValue({ plan: 'pro' });
    const observer = new QueryObserver(client, { queryKey: personalKey, queryFn: statusFetch, staleTime: 60_000 });
    const unsubscribe = observer.subscribe(() => undefined);

    await expect(startBillingCheckout(true)).resolves.toBe(false);

    await vi.waitFor(() => expect(client.getQueryData(personalKey)).toEqual({ plan: 'pro' }));
    expect(statusFetch).toHaveBeenCalledTimes(1);
    expect(toastMocks.error).toHaveBeenCalledWith('You already have Pro.');
    // Every cached plan is marked stale, whichever context a page shows next.
    expect(client.getQueryState(organizationKey)?.isInvalidated).toBe(true);
    unsubscribe();
  });

  it('reloads the plan when the subscription needs attention and the portal cannot open', async () => {
    apiMocks.createBillingCheckout.mockRejectedValueOnce(conflict('subscription_needs_attention'));
    apiMocks.createBillingPortal.mockRejectedValueOnce(new Error('No Stripe customer found for user'));

    await expect(startBillingCheckout(true)).resolves.toBe(false);

    expect(client.getQueryState(personalKey)?.isInvalidated).toBe(true);
  });

  it('reloads the plan when support manages it', async () => {
    apiMocks.createBillingCheckout.mockRejectedValueOnce(conflict('plan_managed_by_support'));

    await expect(startBillingCheckout(true)).resolves.toBe(false);

    expect(client.getQueryState(personalKey)?.isInvalidated).toBe(true);
  });

  it('reloads the plan for a plan gate handled after an import or export fails', async () => {
    apiMocks.createBillingCheckout.mockRejectedValueOnce(conflict('already_subscribed'));

    await handleAccessFailure(createApiError(403, { error: 'Upgrade required', code: 'upgrade_required' }), {
      fallbackMessage: 'Failed to export templates',
      isCurrent: () => true,
    });

    expect(client.getQueryState(personalKey)?.isInvalidated).toBe(true);
  });

  it('keeps the cached plan when checkout fails for another reason', async () => {
    apiMocks.createBillingCheckout.mockRejectedValueOnce(conflict('checkout_incomplete'));
    apiMocks.createBillingCheckout.mockRejectedValueOnce(new Error('Failed to start checkout'));

    await startBillingCheckout(true);
    await startBillingCheckout(true);

    expect(client.getQueryState(personalKey)?.isInvalidated).toBe(false);
  });

  it('reloads the plan once when a second click joined the same checkout', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    let fail: (error: unknown) => void = () => {};
    apiMocks.createBillingCheckout.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));

    const first = startBillingCheckout(true);
    const second = startBillingCheckout(true);
    fail(conflict('already_subscribed'));

    await expect(Promise.all([first, second])).resolves.toEqual([false, false]);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('stops reloading once unsubscribed', async () => {
    stopRefreshing();
    apiMocks.createBillingCheckout.mockRejectedValueOnce(conflict('already_subscribed'));

    await startBillingCheckout(true);

    expect(client.getQueryState(personalKey)?.isInvalidated).toBe(false);
  });
});
