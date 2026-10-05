import { act } from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authState,
  installNavigationWindow,
  lastDialogProps,
  lastViewProps,
  mockCreateBillingCheckout,
  mockDialogProps,
  mockToastSuccess,
  openThePublishedRouteInTheDom,
  publishedClipyTemplate,
  renderPublishedRoute,
  resetToASignedInUserInPersonal,
  restoreNavigationWindow,
} from '../../support/publicTemplatePage';
import { readGuestRun, saveGuestRun, startGuestRun } from '@/features/guest-runs/guestRunStore';
import { deferred } from '../../support/deferred';
import { navigation } from '../../support/nextNavigation';

const GUEST_RUN_PATH = '/profile/alice/reviewed-clipy-checklist/run/';

beforeAll(installNavigationWindow);
afterAll(restoreNavigationWindow);

describe('PublicTemplate Start Run', () => {
  beforeEach(() => {
    resetToASignedInUserInPersonal();
  });

  it('creates one run when the dialog is confirmed twice before the first finishes', async () => {
    const pending = deferred<{ kind: 'ok'; runId: string }>();
    const startRun = vi.fn().mockReturnValue(pending.promise);
    renderPublishedRoute(publishedClipyTemplate, { startRun });
    const { onConfirm } = lastDialogProps();

    const first = onConfirm('Launch run');
    const second = onConfirm('Launch run');
    pending.resolve({ kind: 'ok', runId: 'run-1' });
    await Promise.all([first, second]);

    expect(startRun).toHaveBeenCalledTimes(1);
    expect(navigation.router.push).toHaveBeenCalledTimes(1);
    expect(navigation.url()).toBe('/dashboard/runs/run-1/');

    startRun.mockResolvedValue({ kind: 'ok', runId: 'run-2' });
    await onConfirm('Launch run');
    expect(startRun).toHaveBeenCalledTimes(2);
  });

  it('allows another Start Run after a failed attempt', async () => {
    const startRun = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'error', message: 'Failed to start template run' })
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ kind: 'ok', runId: 'run-1' });
    renderPublishedRoute(publishedClipyTemplate, { startRun });
    const { onConfirm } = lastDialogProps();

    await onConfirm('Launch run');
    await expect(onConfirm('Launch run')).rejects.toThrow('network down');
    await onConfirm('Launch run');

    expect(startRun).toHaveBeenCalledTimes(3);
    expect(navigation.router.push).toHaveBeenCalledTimes(1);
  });
});

describe('PublicTemplate Save', () => {
  beforeEach(() => {
    mockCreateBillingCheckout.mockReset();
    mockCreateBillingCheckout.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/test' });
    resetToASignedInUserInPersonal();
  });

  it.each([
    ['an error', { kind: 'error', message: 'Checking your plan. Try again in a moment.' }, true],
    ['an upgrade that redirects to checkout', { kind: 'upgrade_required' }, true],
    ['an upgrade while billing is unavailable', { kind: 'upgrade_required' }, false],
    ['a login redirect', { kind: 'login_required' }, true],
  ])('reports %s as not saved', async (_label, result, billingEnabled) => {
    const saveTemplate = vi.fn().mockResolvedValue(result);
    renderPublishedRoute(publishedClipyTemplate, {
      billingState: { billingEnabled, isError: false, isLoading: false, isPro: false },
      saveTemplate,
    });

    await expect(lastViewProps().onSaveTemplate()).resolves.toBe(false);
    expect(saveTemplate).toHaveBeenCalledTimes(1);
  });

  it('reports a successful save as saved', async () => {
    const saveTemplate = vi.fn().mockResolvedValue({ kind: 'ok', templateId: 'clone-1' });
    renderPublishedRoute(publishedClipyTemplate, { saveTemplate });

    await expect(lastViewProps().onSaveTemplate()).resolves.toBe(true);
  });

  it('saves once when Save is clicked twice before the first finishes', async () => {
    const pending = deferred<{ kind: 'ok'; templateId: string }>();
    const saveTemplate = vi.fn().mockReturnValue(pending.promise);
    renderPublishedRoute(publishedClipyTemplate, { saveTemplate });
    const { onSaveTemplate } = lastViewProps();

    const first = onSaveTemplate();
    const second = onSaveTemplate();
    pending.resolve({ kind: 'ok', templateId: 'clone-1' });

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(false);
    expect(saveTemplate).toHaveBeenCalledTimes(1);
  });
});

describe('PublicTemplate Start a Run dialog', () => {
  beforeEach(() => {
    resetToASignedInUserInPersonal();
    mockDialogProps.mockReset();
  });

  it('gives the dialog the template title for its default name, closed until Start Run', () => {
    renderPublishedRoute(publishedClipyTemplate);

    expect(lastDialogProps()).toEqual(
      expect.objectContaining({ loading: false, open: false, templateTitle: publishedClipyTemplate.title }),
    );
  });

  it('opens the dialog on Start Run instead of starting a run', async () => {
    const startRun = vi.fn().mockResolvedValue({ kind: 'ok', runId: 'run-1' });
    await openThePublishedRouteInTheDom(publishedClipyTemplate, { modelOverrides: { startRun } });
    expect(lastDialogProps().open).toBe(false);

    await act(async () => {
      lastViewProps().onStartRun();
    });

    expect(lastDialogProps().open).toBe(true);
    expect(startRun).not.toHaveBeenCalled();
    expect(navigation.router.push).not.toHaveBeenCalled();
  });

  it('starts the run with the name the dialog sends', async () => {
    const startRun = vi.fn().mockResolvedValue({ kind: 'ok', runId: 'run-1' });
    renderPublishedRoute(publishedClipyTemplate, { startRun });

    await lastDialogProps().onConfirm('Camping weekend');

    expect(startRun).toHaveBeenCalledWith('Camping weekend');
  });

  it('offers a visitor who is not signed in the same dialog, and starts the run in this browser, never through the API', async () => {
    authState.isAuthenticated = false;
    authState.user = null;
    const startRun = vi.fn();
    await openThePublishedRouteInTheDom(publishedClipyTemplate, { modelOverrides: { startRun } });

    await act(async () => {
      lastViewProps().onStartRun();
    });
    expect(lastDialogProps().open).toBe(true);
    await act(async () => {
      await lastDialogProps().onConfirm('Camping weekend');
    });

    expect(startRun).not.toHaveBeenCalled();
    expect(readGuestRun(publishedClipyTemplate.id)).toMatchObject({ status: 'in_progress', title: 'Camping weekend' });
    expect(mockToastSuccess).toHaveBeenCalledWith('Checklist run created');
    expect(navigation.url()).toBe(GUEST_RUN_PATH);
    expect(lastDialogProps().open).toBe(false);
  });

  it('links Start Run to the run a visitor not signed in already has in progress here, and starts a new one once that run is completed', async () => {
    authState.isAuthenticated = false;
    authState.user = null;
    await openThePublishedRouteInTheDom(publishedClipyTemplate, {
      inThisBrowser: () => startGuestRun(publishedClipyTemplate, 'Camping weekend'),
    });
    expect(lastViewProps().continueRunPath).toBe(GUEST_RUN_PATH);

    await openThePublishedRouteInTheDom(publishedClipyTemplate, {
      inThisBrowser: () => {
        const started = startGuestRun(publishedClipyTemplate, 'Camping weekend');
        saveGuestRun({ ...started, status: 'completed' });
      },
    });
    expect(lastViewProps().continueRunPath).toBeNull();
  });

  it("keeps a signed-in user's Start Run on runs in their account, even with a run started here while signed out", async () => {
    const startRun = vi.fn().mockResolvedValue({ kind: 'ok', runId: 'run-1' });
    await openThePublishedRouteInTheDom(publishedClipyTemplate, {
      modelOverrides: { startRun },
      inThisBrowser: () => startGuestRun(publishedClipyTemplate, 'Camping weekend'),
    });

    expect(lastViewProps().continueRunPath).toBeNull();
    await act(async () => {
      await lastDialogProps().onConfirm('Lake trip');
    });
    expect(startRun).toHaveBeenCalledWith('Lake trip');
    expect(navigation.url()).toBe('/dashboard/runs/run-1/');
  });
});
