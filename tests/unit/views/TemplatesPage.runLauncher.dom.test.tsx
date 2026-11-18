import { navigation } from '../../support/mockedNextNavigation';
import { showTheTemplatesModel, websiteLaunchTemplate } from '../../support/mockedDashboardTemplatesModel';
import React from 'react';
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import type { DashboardTemplateRunResult } from '@/features/dashboard-templates/useDashboardTemplatesModel';
import { api } from '@/lib/api';
import { ORGANIZATION_UPGRADE_MESSAGE } from '@/lib/access-flow';
import Templates from '@/views/Templates';
import { renderSettled, theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';
import { clickInTheDialog } from '../../support/confirmDialogs';

vi.mock('@/hooks/usePageVisit', async () => (await import('../../support/pageVisitMock')).pageVisitOfAUserStillOnThePage);
vi.mock('@/lib/api', () => ({ api: { createBillingCheckout: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

theInMemoryBrowserAsTheWindow();

const createRunFromTemplate = vi.fn<(runName?: string) => Promise<DashboardTemplateRunResult>>();
const closeRunLauncher = vi.fn();

beforeEach(() => {
  createRunFromTemplate.mockReset();
  closeRunLauncher.mockReset();
  vi.mocked(api.createBillingCheckout).mockReset();
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
});

afterEach(() => cleanup());

const openTheRunLauncher = async (isTeamWorkspace = false) => {
  showTheTemplatesModel({
    closeRunLauncher,
    createRunFromTemplate,
    isTeamWorkspace,
    runLauncherOpen: true,
    selectedTemplate: websiteLaunchTemplate(),
    selectedTemplateId: 'template-1',
  });
  navigation.reset('/dashboard/templates/');
  await renderSettled(<Templates />);
  return screen.getByRole('dialog', { name: 'Start a Run' });
};

const startTheRun = async () => clickInTheDialog(await openTheRunLauncher(), 'Start Run');

describe('My Templates Start a Run', () => {
  it('closes the launcher on Cancel', async () => {
    await clickInTheDialog(await openTheRunLauncher(), 'Cancel');

    expect(closeRunLauncher).toHaveBeenCalledTimes(1);
    expect(createRunFromTemplate).not.toHaveBeenCalled();
  });

  it('says the run was created', async () => {
    createRunFromTemplate.mockResolvedValue({ kind: 'ok', runId: 'run-1' });

    await startTheRun();

    expect(createRunFromTemplate).toHaveBeenCalledWith(expect.stringContaining('Website Launch Checklist'));
    expect(toast.success).toHaveBeenCalledWith('Checklist run created');
  });

  it('shows why the run did not start', async () => {
    createRunFromTemplate.mockResolvedValue({ kind: 'error', message: 'Template not found' });

    await startTheRun();

    expect(toast.error).toHaveBeenCalledWith('Template not found');
  });

  it('sends a user whose session ended to sign in, and back', async () => {
    createRunFromTemplate.mockResolvedValue({ kind: 'login_required' });

    await startTheRun();

    expect(navigation.url()).toBe('/login/?next=%2Fdashboard%2Ftemplates%2F');
  });
});

describe('My Templates Start a Run past the plan limit', () => {
  beforeEach(() => {
    createRunFromTemplate.mockResolvedValue({ kind: 'upgrade_required', message: 'Upgrade to Pro' });
  });

  it('opens Stripe Checkout for a Personal user and holds the launcher until the page leaves', async () => {
    vi.mocked(api.createBillingCheckout).mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/test' });

    await startTheRun();

    expect(navigation.documentLoads).toEqual([{ kind: 'assign', href: 'https://checkout.stripe.com/c/pay/test' }]);
    const launcher = screen.getByRole('dialog', { name: 'Start a Run' });
    expect(within(launcher).getByRole('button', { name: 'Starting…' }).hasAttribute('disabled')).toBe(true);
  });

  it('lets the user try again when checkout does not open', async () => {
    vi.mocked(api.createBillingCheckout).mockRejectedValue(new Error('Stripe is unavailable'));

    await startTheRun();

    expect(toast.error).toHaveBeenCalledWith('Stripe is unavailable');
    const launcher = screen.getByRole('dialog', { name: 'Start a Run' });
    expect(within(launcher).getByRole('button', { name: 'Start Run' }).hasAttribute('disabled')).toBe(false);
  });

  it('tells an Organization member the Organization needs a paid plan, with no checkout', async () => {
    await clickInTheDialog(await openTheRunLauncher(true), 'Start Run');

    expect(toast.error).toHaveBeenCalledWith(ORGANIZATION_UPGRADE_MESSAGE);
    expect(api.createBillingCheckout).not.toHaveBeenCalled();
  });
});
