import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TemplateBackup } from '@/components/TemplateBackup';

type BillingQueryResult = {
  data?: { billingEnabled?: boolean; plan: 'free' | 'pro' | 'team' };
  error: unknown;
  fetchStatus: 'fetching' | 'paused' | 'idle';
  isError: boolean;
  isLoading: boolean;
  isPending: boolean;
  refetch: () => Promise<unknown>;
};

const mocks = vi.hoisted(() => ({
  billingQuery: null as unknown as BillingQueryResult,
  workspace: {
    activeTeamId: undefined as string | undefined,
    activeWorkspace: { id: 'personal', name: 'Personal', role: 'owner', type: 'personal' },
    canEditTemplates: true,
    isTeamWorkspace: false,
  },
}));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => mocks.billingQuery,
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { email: 'admin@example.com', id: 'user-1' } }),
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => mocks.workspace,
}));

vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplateLists: () => ({
    allTemplates: [],
    importTemplates: vi.fn(),
    templates: [],
    templatesLoading: false,
  }),
}));

vi.mock('@/lib/api', () => ({
  api: {
    createBillingCheckout: vi.fn(),
    exportTemplateBackup: vi.fn(),
    getBillingStatus: vi.fn(),
  },
}));

const failedBillingQuery = (): BillingQueryResult => ({
  data: undefined,
  error: new Error('HTTP 500'),
  fetchStatus: 'idle',
  isError: true,
  isLoading: false,
  isPending: false,
  refetch: vi.fn().mockResolvedValue(undefined),
});

const knownBillingQuery = (plan: 'free' | 'pro' | 'team'): BillingQueryResult => ({
  data: { billingEnabled: true, plan },
  error: null,
  fetchStatus: 'idle',
  isError: false,
  isLoading: false,
  isPending: false,
  refetch: vi.fn().mockResolvedValue(undefined),
});

const getTag = (html: string, pattern: RegExp): string => html.match(pattern)?.[0] ?? '';
const fileInput = (html: string) => getTag(html, /<input[^>]*id="template-file-input"[^>]*>/);
const exportButton = (html: string) =>
  getTag(html, /<button(?:(?!<button).)*Export Portable Pack/);
const isDisabled = (tag: string) => {
  expect(tag).not.toBe('');
  return /\sdisabled=""/.test(tag);
};

describe('TemplateBackup billing gate', () => {
  afterEach(() => {
    mocks.workspace.activeTeamId = undefined;
    mocks.workspace.isTeamWorkspace = false;
  });

  it('does not treat a failed billing-status request as the Free plan', () => {
    mocks.billingQuery = failedBillingQuery();

    const html = renderToStaticMarkup(<TemplateBackup />);

    expect(html).not.toContain('Pro feature');
    expect(html).not.toContain('available on Pro');
    expect(html).not.toContain('Upgrade to Pro');
    expect(html).toContain('Couldn&#x27;t check your plan');
    expect(html).toContain('Retry');
    expect(isDisabled(fileInput(html))).toBe(false);
    expect(isDisabled(exportButton(html))).toBe(false);
  });

  it('does not show the paid Organization banner when the Organization plan is unknown', () => {
    mocks.billingQuery = failedBillingQuery();
    mocks.workspace.activeTeamId = 'team-1';
    mocks.workspace.isTeamWorkspace = true;

    const html = renderToStaticMarkup(<TemplateBackup />);

    expect(html).not.toContain('Paid Organization feature');
    expect(html).not.toContain('requires a paid Organization plan');
  });

  it('still shows the upgrade banner when the plan is known to be Free', () => {
    mocks.billingQuery = knownBillingQuery('free');

    const html = renderToStaticMarkup(<TemplateBackup />);

    expect(html).toContain('Pro feature');
    expect(html).toContain('Upgrade to Pro');
    expect(html).not.toContain('Couldn&#x27;t check your plan');
    expect(isDisabled(fileInput(html))).toBe(true);
    expect(isDisabled(exportButton(html))).toBe(true);
  });

  it('enables import and export for a known Pro plan', () => {
    mocks.billingQuery = knownBillingQuery('pro');

    const html = renderToStaticMarkup(<TemplateBackup />);

    expect(html).not.toContain('Upgrade to Pro');
    expect(html).not.toContain('Couldn&#x27;t check your plan');
    expect(isDisabled(fileInput(html))).toBe(false);
    expect(isDisabled(exportButton(html))).toBe(false);
  });
});
