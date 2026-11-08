import { navigation } from '../../support/mockedNextNavigation';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { BillingSection } from '@/components/account/BillingSection';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-errors';
import { createTestQueryClient, seedQueryError } from '../../fixtures/queryClient';
import { renderSettled, theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';
import { expectOneCallOnlyAfterABackForwardRestore } from '../../support/pageRestore';

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

vi.mock('@/contexts/WorkspaceContext', async () => {
  const { ownerConsoleContext } = await import('@/lib/consoleRoutes');
  return {
    useWorkspace: () => ({
      activeWorkspace: workspaceMock.value.activeTeamId
        ? { type: 'team', teamId: workspaceMock.value.activeTeamId, name: 'Acme Org' }
        : { type: 'personal', name: 'Personal' },
      consoleContext: ownerConsoleContext(workspaceMock.value.activeTeamId),
      ...workspaceMock.value,
    }),
  };
});

const draftMock = vi.hoisted(() => ({
  readTemplateDraft: vi.fn(() => null as unknown),
}));

vi.mock('@/features/template-editor/templateDraftStore', () => draftMock);

vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), message: vi.fn(), success: vi.fn() } }));

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

  navigation.reset('/dashboard/settings/');
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

    expect(html).toContain('Personal billing');
    expect(html).toContain('Current plan: <span');
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

  it('offers Upgrade again after a first payment did not go through in Checkout', () => {
    const html = renderBillingSection({
      billingEnabled: true,
      plan: 'free',
      subscriptionStatus: 'incomplete',
      canManageBilling: true,
    });

    expect(html).toContain('Upgrade to Pro — $9/month');
    expect(html).not.toContain('needs attention');
    expect(html).not.toContain('Manage subscription');
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

    expect(html).toContain('Acme Org billing');
    expect(html).not.toContain('Personal billing');
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

  it('links back to a template draft kept while the user upgraded, since checkout returns to Billing, not to the editor', () => {
    draftMock.readTemplateDraft.mockReturnValueOnce({
      savedAt: '2026-09-28T10:00:00.000Z',
      values: { title: 'Launch checklist' },
    });

    const html = renderBillingSection({ billingEnabled: true, plan: 'pro' });

    expect(draftMock.readTemplateDraft).toHaveBeenCalledWith({ userId: 'user-1', teamId: undefined });
    expect(html).toContain('Resume template draft');
    expect(html).toContain('href="/dashboard/templates/new/"');
  });

  it("links an Organization's kept draft to New Template in that Organization", () => {
    draftMock.readTemplateDraft.mockReturnValueOnce({
      savedAt: '2026-09-28T10:00:00.000Z',
      values: { title: 'Launch checklist' },
    });

    const html = renderBillingSection({ billingEnabled: true, plan: 'team' }, 'team-1');

    expect(draftMock.readTemplateDraft).toHaveBeenCalledWith({ userId: 'user-1', teamId: 'team-1' });
    expect(html).toContain('href="/dashboard/organization/team-1/templates/new/"');
  });

  it('shows no draft link when nothing was kept', () => {
    const html = renderBillingSection({ billingEnabled: true, plan: 'pro' });

    expect(html).not.toContain('Resume template draft');
  });

  it('does not offer an upgrade or keep "Checking..." when billing status failed to load', () => {
    workspaceMock.value = { activeTeamId: undefined, isTeamWorkspace: false };
    const queryClient = createTestQueryClient();
    seedQueryError(queryClient, ['billing', 'status', 'user-1', 'personal']);

    navigation.reset('/dashboard/settings/');
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <BillingSection />
      </QueryClientProvider>,
    );

    expect(html).toContain('Unavailable');
    expect(html).toContain('Billing status unavailable.');
    expect(html).toContain('Retry');
    expect(html).not.toContain('Checking...');
    expect(html).not.toContain('Upgrade to Pro');
    expect(html).not.toContain('Manage subscription');
  });
});

describe('BillingSection after Back restores the page from the back/forward cache', () => {
  theInMemoryBrowserAsTheWindow();

  it('refetches billing status, since the plan may have changed at Stripe or in another tab', async () => {
    workspaceMock.value = { activeTeamId: undefined, isTeamWorkspace: false };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    queryClient.setQueryData(['billing', 'status', 'user-1', 'personal'], { billingEnabled: true, plan: 'free' });
    navigation.reset('/dashboard/settings/');
    await renderSettled(
      <QueryClientProvider client={queryClient}>
        <BillingSection />
      </QueryClientProvider>,
    );

    await expectOneCallOnlyAfterABackForwardRestore(navigation.window, vi.mocked(api.getBillingStatus));
  });
});

describe('BillingSection actions in the browser', () => {
  theInMemoryBrowserAsTheWindow();

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const personalStatusKey = ['billing', 'status', 'user-1', 'personal'];

  const mountAt = async (url: string, billingData: { billingEnabled?: boolean; plan: 'free' | 'pro'; subscriptionStatus?: string; canManageBilling?: boolean }) => {
    workspaceMock.value = { activeTeamId: undefined, isTeamWorkspace: false };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    queryClient.setQueryData(personalStatusKey, billingData);
    navigation.reset(url);
    const rendered = await renderSettled(
      <QueryClientProvider client={queryClient}>
        <BillingSection />
      </QueryClientProvider>,
    );
    return { queryClient, ...rendered };
  };

  const proSubscriber = { billingEnabled: true, plan: 'pro' as const, subscriptionStatus: 'active', canManageBilling: true };

  const press = (name: string | RegExp) =>
    act(async () => {
      fireEvent.click(screen.getByRole('button', { name }));
    });

  it('opens Stripe Checkout from Upgrade to Pro and says it is opening until the page leaves', async () => {
    vi.mocked(api.createBillingCheckout).mockResolvedValue({ url: 'https://checkout.stripe.test/session' });
    await mountAt('/dashboard/settings/', { billingEnabled: true, plan: 'free' });

    await press(/^Upgrade to Pro/);

    expect(navigation.documentLoads).toContainEqual({ kind: 'assign', href: 'https://checkout.stripe.test/session' });
    expect(screen.getByRole('button', { name: 'Opening checkout...' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows why checkout did not open, and reloads the plan when the account already subscribed elsewhere', async () => {
    vi.mocked(api.createBillingCheckout).mockRejectedValue(
      new ApiError({ status: 409, message: 'You already have a Pro subscription', code: 'already_subscribed' }),
    );
    await mountAt('/dashboard/settings/', { billingEnabled: true, plan: 'free' });

    await press(/^Upgrade to Pro/);

    expect(toast.error).toHaveBeenCalledWith('You already have a Pro subscription');
    await waitFor(() => expect(api.getBillingStatus).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: /^Upgrade to Pro/ }).hasAttribute('disabled')).toBe(false);
  });

  it('keeps the plan as loaded when checkout failed for another reason', async () => {
    vi.mocked(api.createBillingCheckout).mockRejectedValue(new ApiError({ status: 503, message: 'Stripe is down' }));
    await mountAt('/dashboard/settings/', { billingEnabled: true, plan: 'free' });

    await press(/^Upgrade to Pro/);

    expect(toast.error).toHaveBeenCalledWith('Stripe is down');
    expect(api.getBillingStatus).not.toHaveBeenCalled();
  });

  it('opens the billing portal from Manage subscription', async () => {
    vi.mocked(api.createBillingPortal).mockResolvedValue({ url: 'https://billing.stripe.test/portal' });
    await mountAt('/dashboard/settings/', proSubscriber);

    await press('Manage subscription');

    expect(navigation.documentLoads).toContainEqual({ kind: 'assign', href: 'https://billing.stripe.test/portal' });
    expect(screen.getByRole('button', { name: 'Opening billing...' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows why the portal did not open, and reloads the plan when Stripe has no customer for the account', async () => {
    vi.mocked(api.createBillingPortal).mockRejectedValue(
      new ApiError({ status: 409, message: 'No billing account yet', code: 'billing_customer_missing' }),
    );
    await mountAt('/dashboard/settings/', proSubscriber);

    await press('Manage subscription');

    expect(toast.error).toHaveBeenCalledWith('No billing account yet');
    await waitFor(() => expect(api.getBillingStatus).toHaveBeenCalledTimes(1));
  });

  it('keeps the plan as loaded when the portal failed for another reason', async () => {
    vi.mocked(api.createBillingPortal).mockRejectedValue(new ApiError({ status: 503, message: 'Portal is down' }));
    await mountAt('/dashboard/settings/', proSubscriber);

    await press('Manage subscription');

    expect(toast.error).toHaveBeenCalledWith('Portal is down');
    expect(api.getBillingStatus).not.toHaveBeenCalled();
  });

  it('turns Upgrade off and says so while billing is unavailable', async () => {
    await mountAt('/dashboard/settings/', { billingEnabled: false, plan: 'free' });

    expect(screen.getByRole('button', { name: 'Upgrade unavailable' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Billing checkout is currently unavailable.')).toBeTruthy();
  });

  it('says a canceled checkout was canceled and drops the billing parameter from the address', async () => {
    await mountAt('/dashboard/settings/?billing=cancel&tab=plan#billing', { billingEnabled: true, plan: 'free' });

    expect(toast.message).toHaveBeenCalledWith('Upgrade canceled.');
    expect(navigation.url()).toBe('/dashboard/settings/?tab=plan#billing');
  });

  it('welcomes a new Pro subscriber once the plan shows Pro after checkout', async () => {
    vi.mocked(api.getBillingStatus).mockResolvedValueOnce({ billingEnabled: true, plan: 'pro' });
    await mountAt('/dashboard/settings/?billing=success', { billingEnabled: true, plan: 'free' });

    expect(toast.message).toHaveBeenCalledWith('Payment received. Activating Pro…');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Welcome to Pro!'));
    expect(navigation.url()).toBe('/dashboard/settings/');
  });

  it('says the payment is still processing when Pro has not appeared after every check', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    vi.mocked(api.getBillingStatus).mockResolvedValue({ billingEnabled: true, plan: 'free' });
    await mountAt('/dashboard/settings/?billing=success', { billingEnabled: true, plan: 'free' });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(toast.info).toHaveBeenCalledWith('Your payment is processing. Pro will appear here shortly.');
    expect(navigation.url()).toBe('/dashboard/settings/');
  });

  it('stops checking for Pro once the user leaves Billing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    vi.mocked(api.getBillingStatus).mockResolvedValue({ billingEnabled: true, plan: 'free' });
    const { unmount } = await mountAt('/dashboard/settings/?billing=success', { billingEnabled: true, plan: 'free' });

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('offers Retry when a refresh of a loaded plan failed, and keeps the plan', async () => {
    vi.mocked(api.getBillingStatus).mockRejectedValue(new ApiError({ status: 503, message: 'Down' }));
    const { queryClient } = await mountAt('/dashboard/settings/', proSubscriber);

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: personalStatusKey });
    });
    await screen.findByText("Couldn't refresh billing status.");
    vi.mocked(api.getBillingStatus).mockResolvedValue({ billingEnabled: true, plan: 'pro' });

    await press('Retry');

    await waitFor(() => expect(screen.queryByText("Couldn't refresh billing status.")).toBeNull());
    expect(screen.getByText('Pro')).toBeTruthy();
  });
});
