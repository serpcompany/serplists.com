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

const draftMock = vi.hoisted(() => ({
  readTemplateDraft: vi.fn(() => null as unknown),
}));

vi.mock('@/features/template-editor/templateDraftStore', () => draftMock);

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

  // Checkout returns here, not to the editor: the draft kept for it must be reachable.
  it('links back to a template draft kept while the user upgraded', () => {
    draftMock.readTemplateDraft.mockReturnValueOnce({
      savedAt: '2026-09-28T10:00:00.000Z',
      values: { title: 'Launch checklist' },
    });

    const html = renderBillingSection({ billingEnabled: true, plan: 'pro' });

    expect(draftMock.readTemplateDraft).toHaveBeenCalledWith({ userId: 'user-1', teamId: undefined });
    expect(html).toContain('Resume template draft');
    expect(html).toContain('href="/dashboard/templates/new"');
  });

  it('shows no draft link when nothing was kept', () => {
    const html = renderBillingSection({ billingEnabled: true, plan: 'pro' });

    expect(html).not.toContain('Resume template draft');
  });
});
