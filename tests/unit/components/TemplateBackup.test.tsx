import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
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
  exportRunning: false,
  templateListOptions: [] as unknown[],
  templateLists: {
    allTemplates: [] as Array<Record<string, unknown>>,
    templatesError: null as unknown,
    templatesLoading: false,
  },
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
  useTemplateLists: (options?: unknown) => {
    mocks.templateListOptions.push(options);
    return {
      allTemplates: mocks.templateLists.allTemplates,
      importTemplates: vi.fn(),
      refetchTemplates: vi.fn(),
      templates: [],
      templatesError: mocks.templateLists.templatesError,
      templatesLoading: mocks.templateLists.templatesLoading,
    };
  },
}));

// The catalog loads only for an export that includes public templates.
vi.mock('@/features/template-backup/publicCatalogLoader', () => ({
  usePublicCatalogLoader: () => vi.fn().mockResolvedValue([]),
}));

// The page's export guard: tests set whether an export is in flight.
vi.mock('@/hooks/useSingleFlight', () => ({
  useSingleFlight: () => ({
    isRunning: mocks.exportRunning,
    run: <T,>(task: () => Promise<T> | T) => Promise.resolve(task()),
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
const exportingButton = (html: string) => getTag(html, /<button(?:(?!<button).)*Exporting\.\.\./);
const includePublicSwitch = (html: string) => getTag(html, /<button[^>]*id="include-public-templates"[^>]*>/);
const statValues = (html: string) =>
  Array.from(html.matchAll(/<div class="text-2xl font-bold[^"]*">([^<]*)<\/div>/g), (match) => match[1]);
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

    const html = renderToStaticMarkup(<MemoryRouter><TemplateBackup /></MemoryRouter>);

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

    const html = renderToStaticMarkup(<MemoryRouter><TemplateBackup /></MemoryRouter>);

    expect(html).not.toContain('Paid Organization feature');
    expect(html).not.toContain('requires a paid Organization plan');
  });

  it('still shows the upgrade banner when the plan is known to be Free', () => {
    mocks.billingQuery = knownBillingQuery('free');

    const html = renderToStaticMarkup(<MemoryRouter><TemplateBackup /></MemoryRouter>);

    expect(html).toContain('Pro feature');
    expect(html).toContain('Upgrade to Pro');
    expect(html).not.toContain('Couldn&#x27;t check your plan');
    expect(isDisabled(fileInput(html))).toBe(true);
    expect(isDisabled(exportButton(html))).toBe(true);
  });

  it('enables import and export for a known Pro plan', () => {
    mocks.billingQuery = knownBillingQuery('pro');

    const html = renderToStaticMarkup(<MemoryRouter><TemplateBackup /></MemoryRouter>);

    expect(html).not.toContain('Upgrade to Pro');
    expect(html).not.toContain('Couldn&#x27;t check your plan');
    expect(isDisabled(fileInput(html))).toBe(false);
    expect(isDisabled(exportButton(html))).toBe(false);
  });
});

describe('TemplateBackup template lists', () => {
  it('loads only the active context list, never the public catalog', () => {
    mocks.billingQuery = knownBillingQuery('pro');
    mocks.templateListOptions.length = 0;

    renderToStaticMarkup(<MemoryRouter><TemplateBackup /></MemoryRouter>);

    expect(mocks.templateListOptions.length).toBeGreaterThan(0);
    for (const options of mocks.templateListOptions) {
      expect((options as { catalog?: boolean } | undefined)?.catalog).not.toBe(true);
    }
  });
});

describe('TemplateBackup while the template list loads', () => {
  afterEach(() => {
    mocks.templateLists.allTemplates = [];
    mocks.templateLists.templatesLoading = false;
  });

  it('shows no counts and keeps export and import off until the list has loaded', () => {
    mocks.billingQuery = knownBillingQuery('pro');
    mocks.templateLists.templatesLoading = true;

    const html = renderToStaticMarkup(<MemoryRouter><TemplateBackup /></MemoryRouter>);

    expect(statValues(html)).toHaveLength(3);
    expect(statValues(html)).not.toContain('0');
    expect(isDisabled(exportButton(html))).toBe(true);
    expect(isDisabled(includePublicSwitch(html))).toBe(true);
    expect(isDisabled(fileInput(html))).toBe(true);
  });

  it('shows the counts and enables export once the list has loaded', () => {
    mocks.billingQuery = knownBillingQuery('pro');
    mocks.templateLists.allTemplates = [
      { id: 't-1', isPublic: true, userId: 'user-1' },
      { id: 't-2', isPublic: false, userId: 'user-1' },
      { id: 'other', isPublic: true, userId: 'user-2' },
    ];

    const html = renderToStaticMarkup(<MemoryRouter><TemplateBackup /></MemoryRouter>);

    expect(statValues(html)).toEqual(['2', '1', '1']);
    expect(isDisabled(exportButton(html))).toBe(false);
    expect(isDisabled(includePublicSwitch(html))).toBe(false);
    expect(isDisabled(fileInput(html))).toBe(false);
  });
});

// A failed list showed 0 templates, public and private, as if the context had none.
describe('TemplateBackup when the template list failed to load', () => {
  afterEach(() => {
    mocks.templateLists.templatesError = null;
  });

  it('says the list failed and offers Retry instead of zero counts', () => {
    mocks.billingQuery = knownBillingQuery('pro');
    mocks.templateLists.templatesError = new Error('HTTP 503');

    const html = renderToStaticMarkup(<MemoryRouter><TemplateBackup /></MemoryRouter>);

    expect(html).toContain('Couldn&#x27;t load your templates');
    expect(html).toContain('Retry');
    expect(statValues(html)).toEqual([]);
    // The server's pack decides what the context owns, so export still works.
    expect(isDisabled(exportButton(html))).toBe(false);
  });
});

describe('TemplateBackup while an export runs', () => {
  afterEach(() => {
    mocks.exportRunning = false;
  });

  it('disables Export and the include-public switch and says it is exporting', () => {
    mocks.billingQuery = knownBillingQuery('pro');
    mocks.exportRunning = true;

    const html = renderToStaticMarkup(<MemoryRouter><TemplateBackup /></MemoryRouter>);

    expect(html).not.toContain('Export Portable Pack');
    expect(isDisabled(exportingButton(html))).toBe(true);
    expect(exportingButton(html)).toContain('aria-busy="true"');
    expect(isDisabled(includePublicSwitch(html))).toBe(true);
  });

  it('enables Export again once the export has finished', () => {
    mocks.billingQuery = knownBillingQuery('pro');

    const html = renderToStaticMarkup(<MemoryRouter><TemplateBackup /></MemoryRouter>);

    expect(exportingButton(html)).toBe('');
    expect(isDisabled(exportButton(html))).toBe(false);
    expect(isDisabled(includePublicSwitch(html))).toBe(false);
  });
});
