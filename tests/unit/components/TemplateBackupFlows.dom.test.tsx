import '../../support/mockedNextNavigation';
import React, { act } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { TemplateBackup } from '@/components/TemplateBackup';
import { ORGANIZATION_BACKUP_UPGRADE_MESSAGE } from '@/components/templateBackupUpgradeMessage';
import { api } from '@/lib/api';
import { ApiError, BILLING_UNAVAILABLE_MESSAGE } from '@/lib/api-errors';
import type { BillingStatusState } from '@/lib/billing';
import { downloadFile } from '@/lib/utils/downloadFile';
import type { TemplateImportSummary } from '@/types/checklist';

import { anyInstanceOf, objectContaining, stringMatching } from '../../support/asymmetricMatchers';
import { deferred } from '../../support/deferred';
import { renderSettled } from '../../support/renderInTheDom';
import { chooseTheOption } from '../../support/selectOptions';
import { chooseTheImportFile, portablePackFile } from '../../support/templateImportFile';

const page = vi.hoisted(() => {
  const proPlan = (): BillingStatusState => ({ status: 'known', billingEnabled: true, isPaid: true, plan: 'pro' });
  return {
    billing: proPlan(),
    canEditTemplates: true,
    isTeamWorkspace: false,
    signedIn: true,
    templatesError: null as Error | null,
    importTemplates: vi.fn(),
    refetchTemplates: vi.fn(),
    refetchBilling: vi.fn(),
  };
});

vi.mock('@/hooks/useBillingStatus', () => ({ useBillingStatus: () => ({ ...page.billing, refetch: page.refetchBilling }) }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: page.signedIn ? { id: 'owner-1', email: 'owner@example.test' } : null }),
}));
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeTeamId: page.isTeamWorkspace ? 'team-1' : undefined,
    activeWorkspace: page.isTeamWorkspace
      ? { id: 'team-1', name: 'Acme Org', role: 'editor', type: 'team' }
      : { id: 'personal', name: 'Personal', role: 'owner', type: 'personal' },
    canEditTemplates: page.canEditTemplates,
    isTeamWorkspace: page.isTeamWorkspace,
  }),
}));
vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplateLists: () => ({
    allTemplates: [],
    importTemplates: page.importTemplates,
    refetchTemplates: page.refetchTemplates,
    templatesError: page.templatesError,
    templatesLoading: false,
  }),
}));
vi.mock('@/lib/api', () => ({ api: { createBillingCheckout: vi.fn(), exportTemplateBackup: vi.fn() } }));
vi.mock('@/lib/utils/downloadFile', () => ({ downloadFile: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

const freePlan = (billingEnabled = true): BillingStatusState => ({ status: 'known', billingEnabled, isPaid: false, plan: 'free' });

const twoTemplates = [
  { title: 'Moving day', description: 'Everything for the truck', sections: [{ title: 'Pack', items: [{ title: 'Boxes' }] }] },
  { title: 'Unpacking', sections: [{ title: 'Kitchen', items: [{ title: 'Plates' }] }] },
];

const summary = (overrides: Partial<TemplateImportSummary> = {}): TemplateImportSummary => ({
  total: 2,
  imported: 2,
  failed: [],
  successes: [
    { index: 0, title: 'Moving day', id: 'new-1', slug: 'moving-day', visibility: 'private' },
    { index: 1, title: 'Unpacking', id: 'new-2', slug: 'unpacking', visibility: 'public' },
  ],
  ...overrides,
});

const theBackupPage = () => (
  <QueryClientProvider client={new QueryClient()}>
    <TemplateBackup />
  </QueryClientProvider>
);

const press = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });

async function chooseTheFile(file: File) {
  const rendered = await renderSettled(theBackupPage());
  await chooseTheImportFile(file);
  return rendered;
}

async function previewTheFile() {
  const rendered = await chooseTheFile(portablePackFile(twoTemplates, 'moving.json'));
  await screen.findByText('Import Preview');
  return rendered;
}

const lastImportResult = () => {
  const heading = screen.getByRole('heading', { name: 'Last Import Result' });
  const card = heading.closest('[data-slot="card"]');
  if (!(card instanceof HTMLElement)) throw new Error('The import result is not in a card');
  return card;
};

beforeEach(() => {
  page.billing = { status: 'known', billingEnabled: true, isPaid: true, plan: 'pro' };
  page.canEditTemplates = true;
  page.isTeamWorkspace = false;
  page.signedIn = true;
  page.templatesError = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('exporting a portable pack', () => {
  it('downloads the pack the server returns and says how many Templates it holds', async () => {
    vi.mocked(api.exportTemplateBackup).mockResolvedValue({ templates: [{ slug: 'moving-day' }, { slug: 'unpacking' }] });
    await renderSettled(theBackupPage());

    await press('Export Portable Pack');

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Exported 2 templates successfully', undefined));
    expect(api.exportTemplateBackup).toHaveBeenCalledWith({ teamId: undefined });
    expect(downloadFile).toHaveBeenCalledWith({
      content: JSON.stringify({ templates: [{ slug: 'moving-day' }, { slug: 'unpacking' }] }, null, 2),
      fileName: stringMatching(/^serplists-template-pack-\d{4}-\d{2}-\d{2}\.json$/),
      type: 'application/json',
    });
  });

  it('warns for longer about the Templates the server left out of the pack', async () => {
    vi.mocked(api.exportTemplateBackup).mockResolvedValue({
      templates: [{ slug: 'moving-day' }],
      manifest: { skippedTemplates: [{ title: 'Huge list', reason: 'too large' }] },
    });
    await renderSettled(theBackupPage());

    await press('Export Portable Pack');

    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith('Exported 1 template. Not exported: Huge list (too large)', { duration: 15000 }),
    );
  });

  const exportFailingWith = async (error: ApiError) => {
    vi.mocked(api.exportTemplateBackup).mockRejectedValue(error);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await renderSettled(theBackupPage());
    await press('Export Portable Pack');
  };

  it("shows the server's message when a personal export fails", async () => {
    await exportFailingWith(new ApiError({ status: 500, message: 'Backup store unavailable' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Backup store unavailable'));
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it("names the Organization's paid plan when an Organization export needs an upgrade, and sends no one to checkout", async () => {
    page.isTeamWorkspace = true;

    await exportFailingWith(new ApiError({ status: 403, message: 'Upgrade', code: 'upgrade_required' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(ORGANIZATION_BACKUP_UPGRADE_MESSAGE));
    expect(api.exportTemplateBackup).toHaveBeenCalledWith({ teamId: 'team-1' });
    expect(api.createBillingCheckout).not.toHaveBeenCalled();
  });

  it('shows any other Organization export failure as it is', async () => {
    page.isTeamWorkspace = true;

    await exportFailingWith(new ApiError({ status: 500, message: 'Backup store unavailable' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Backup store unavailable'));
  });

  it('downloads the sample pack on request', async () => {
    await renderSettled(theBackupPage());

    await press('Download sample portable pack');

    expect(downloadFile).toHaveBeenCalledWith(objectContaining({ fileName: 'sample-moving-checklist-portable.json', type: 'application/json' }));
    expect(toast.success).toHaveBeenCalledWith('Sample portable template pack downloaded. You can import it to preview the new JSON format.');
  });
});

describe('importing a previewed file', () => {
  it('imports the previewed Templates, shows what it imported, and closes the preview', async () => {
    const importing = deferred<TemplateImportSummary>();
    page.importTemplates.mockReturnValue(importing.promise);
    await previewTheFile();
    expect(screen.getByText('Everything for the truck')).toBeTruthy();

    await press('Confirm Import');
    expect(screen.getByRole('button', { name: 'Importing...' }).hasAttribute('disabled')).toBe(true);
    await act(async () => {
      importing.resolve(summary());
    });

    expect(page.importTemplates).toHaveBeenCalledWith(
      [objectContaining({ title: 'Moving day' }), objectContaining({ title: 'Unpacking' })],
      { visibility: 'preserve' },
    );
    expect(toast.success).toHaveBeenCalledWith('Successfully imported 2/2 templates');
    expect(screen.queryByText('Import Preview')).toBeNull();
    const result = lastImportResult();
    expect(within(result).getByText('2 attempted')).toBeTruthy();
    expect(within(result).getByText('2 imported')).toBeTruthy();
    expect(within(result).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Moving dayprivate • /moving-day',
      'Unpackingpublic • /unpacking',
    ]);
    expect(within(result).queryByText('Failed Templates')).toBeNull();
  });

  it('imports with the visibility chosen before confirming', async () => {
    page.importTemplates.mockResolvedValue(summary());
    await previewTheFile();

    await chooseTheOption('Import visibility', 'Force private');
    expect(screen.getByRole('combobox', { name: 'Import visibility' }).textContent).toContain('Force private');
    await press('Confirm Import');

    expect(page.importTemplates).toHaveBeenCalledWith(anyInstanceOf(Array), { visibility: 'private' });
  });

  it('lists the Templates that failed next to the ones that were imported', async () => {
    page.importTemplates.mockResolvedValue(
      summary({
        imported: 1,
        failed: [{ index: 1, title: 'Unpacking', reason: 'Sections are invalid', code: 'invalid_sections' }],
        successes: [{ index: 0, title: 'Moving day', id: 'new-1', slug: 'moving-day', visibility: 'private' }],
      }),
    );
    await previewTheFile();

    await press('Confirm Import');

    expect(toast.error).toHaveBeenCalledWith('Imported 1/2. Failed: Unpacking');
    const result = lastImportResult();
    expect(within(result).getByText('1 failed')).toBeTruthy();
    expect(within(result).getByText('Failed Templates')).toBeTruthy();
    expect(within(result).getByText('• Unpacking: Sections are invalid')).toBeTruthy();
  });

  it('shows the summary the server sends when every Template in the file failed', async () => {
    const allFailed = summary({
      imported: 0,
      failed: [
        { index: 0, title: 'Moving day', reason: 'Too large', code: 'content_too_large' },
        { index: 1, title: '', reason: 'Fields are invalid', code: 'invalid_fields' },
      ],
      successes: [],
    });
    page.importTemplates.mockRejectedValue(new ApiError({ status: 400, message: 'Import failed', code: 'template_import_failed', details: allFailed }));
    await previewTheFile();

    await press('Confirm Import');

    expect(toast.error).toHaveBeenCalledWith('Imported 0/2. Failed: Moving day, Template 2');
    const result = lastImportResult();
    expect(within(result).queryByText('Imported:')).toBeNull();
    expect(within(result).getByText('• Template 2: Fields are invalid')).toBeTruthy();
    expect(screen.getByText('Import Preview')).toBeTruthy();
  });

  it('keeps the preview and shows the error when the import request fails', async () => {
    page.importTemplates.mockRejectedValue(new ApiError({ status: 500, message: 'Database unavailable' }));
    await previewTheFile();

    await press('Confirm Import');

    expect(toast.error).toHaveBeenCalledWith('Database unavailable');
    expect(screen.queryByRole('heading', { name: 'Last Import Result' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirm Import' }).hasAttribute('disabled')).toBe(false);
  });

  it('refuses a file that is not a Template file, with no preview', async () => {
    await chooseTheFile(new File(['notes'], 'notes.txt', { type: 'text/plain' }));

    expect(toast.error).toHaveBeenCalledWith('Please select a JSON, Markdown, or YAML template file');
    expect(screen.queryByText('Import Preview')).toBeNull();
  });

  it('closes the preview without importing on Cancel', async () => {
    await previewTheFile();

    await press('Cancel');

    expect(screen.queryByText('Import Preview')).toBeNull();
    expect(page.importTemplates).not.toHaveBeenCalled();
  });
});

describe('a preview whose access changed before Confirm Import', () => {
  it('imports nothing once the user has signed out', async () => {
    const rendered = await previewTheFile();
    page.signedIn = false;
    rendered.rerender(theBackupPage());

    await press('Confirm Import');

    expect(page.importTemplates).not.toHaveBeenCalled();
  });

  it('refuses the import once the user lost editor access to the Organization', async () => {
    page.isTeamWorkspace = true;
    const rendered = await previewTheFile();
    page.canEditTemplates = false;
    rendered.rerender(theBackupPage());

    await press('Confirm Import');

    expect(toast.error).toHaveBeenCalledWith('You need editor access to import templates into this Organization.');
    expect(page.importTemplates).not.toHaveBeenCalled();
  });

  it('says billing is off instead of importing once the plan check says Free', async () => {
    page.billing = { status: 'error' };
    const rendered = await previewTheFile();
    page.billing = freePlan(false);
    rendered.rerender(theBackupPage());

    await press('Confirm Import');

    expect(toast.error).toHaveBeenCalledWith(BILLING_UNAVAILABLE_MESSAGE);
    expect(page.importTemplates).not.toHaveBeenCalled();
  });

  it("names the Organization's paid plan once the plan check says the Organization is Free", async () => {
    page.isTeamWorkspace = true;
    page.billing = { status: 'error' };
    const rendered = await previewTheFile();
    page.billing = freePlan();
    rendered.rerender(theBackupPage());

    await press('Confirm Import');

    expect(toast.error).toHaveBeenCalledWith(ORGANIZATION_BACKUP_UPGRADE_MESSAGE);
    expect(api.createBillingCheckout).not.toHaveBeenCalled();
  });
});

describe('what the page offers each user', () => {
  it('starts checkout from Upgrade to Pro on the Free plan', async () => {
    page.billing = freePlan();
    vi.mocked(api.createBillingCheckout).mockRejectedValue(new ApiError({ status: 500, message: 'Stripe is down' }));
    await renderSettled(theBackupPage());

    await press('Upgrade to Pro');

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Stripe is down'));
    expect(api.createBillingCheckout).toHaveBeenCalledTimes(1);
  });

  it('retries the plan check from its notice', async () => {
    page.billing = { status: 'error' };
    await renderSettled(theBackupPage());

    await press('Retry');

    expect(page.refetchBilling).toHaveBeenCalledTimes(1);
  });

  it('retries loading the Templates when the list failed', async () => {
    page.templatesError = new Error('HTTP 503');
    await renderSettled(theBackupPage());

    await press('Retry');

    expect(page.refetchTemplates).toHaveBeenCalledTimes(1);
  });

  it('tells an Organization viewer that import and export need editor access, and turns both off', async () => {
    page.isTeamWorkspace = true;
    page.canEditTemplates = false;
    await renderSettled(theBackupPage());

    expect(screen.getByText('Editor access required')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export Portable Pack' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows no plan notice and no Templates before anyone has signed in', async () => {
    page.signedIn = false;
    page.billing = freePlan();
    await renderSettled(theBackupPage());

    expect(screen.queryByText('Pro feature')).toBeNull();
    expect(screen.getByText('My Templates').parentElement?.textContent).toContain('0');
    expect(screen.getByRole('button', { name: 'Export Portable Pack' }).hasAttribute('disabled')).toBe(true);
  });
});
