import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TemplateBackup } from '@/components/TemplateBackup';
import { createTestQueryClient, seedQueryError } from '../../fixtures/queryClient';

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { email: 'john@example.com', id: 'user-1' } }),
}));

vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplateLists: () => ({ allTemplates: [], importTemplates: vi.fn(), templates: [] }),
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeTeamId: undefined,
    activeWorkspace: { id: 'personal', name: 'Personal', type: 'personal' },
    canEditTemplates: true,
    isTeamWorkspace: false,
  }),
}));

vi.mock('@/lib/access-flow', () => ({
  handleAccessFailure: vi.fn(),
  startBillingCheckout: vi.fn(),
}));

const billingKey = ['billing', 'status', 'user-1', 'personal'];

const render = (queryClient = createTestQueryClient()) =>
  renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <TemplateBackup />
    </QueryClientProvider>,
  );

describe('TemplateBackup', () => {
  it('shows the Pro upsell to a Free user', () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(billingKey, { billingEnabled: true, plan: 'free' });

    const html = render(queryClient);

    expect(html).toContain('Pro feature');
    expect(html).toContain('Upgrade to Pro');
  });

  it('does not treat a failed billing status as Free', () => {
    const queryClient = createTestQueryClient();
    seedQueryError(queryClient, billingKey);

    const html = render(queryClient);

    expect(html).toContain('check your plan');
    expect(html).toContain('Retry');
    expect(html).not.toContain('Pro feature');
    expect(html).not.toContain('Upgrade to Pro');
  });
});
