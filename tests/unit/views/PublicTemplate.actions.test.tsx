import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authState,
  CLEAN_VISIT,
  installNavigationWindow,
  lastDialogProps,
  lastViewProps,
  mockCreateBillingCheckout,
  mockDialogProps,
  mockUseTemplateDetailModel,
  publishedClipyTemplate,
  renderPublishedRoute,
  resetToASignedInUserInPersonal,
  restoreNavigationWindow,
} from '../../support/publicTemplatePage';
import PublicTemplate from '@/views/PublicTemplate';
import { createFakeContainer, installFakeDomGlobals } from '../../fixtures/fakeDom';
import { deferred } from '../../support/deferred';
import { navigation } from '../../support/nextNavigation';

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
      billingState: { billingEnabled, isLoading: false, isPro: false },
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
    mockUseTemplateDetailModel.mockReturnValue({
      billingState: { billingEnabled: true, isError: false, isLoading: false, isPro: false },
      loading: false,
      notFound: false,
      saveTemplate: vi.fn(),
      startRun,
      template: publishedClipyTemplate,
      totalItems: 0,
    });
    navigation.reset(`${CLEAN_VISIT.origin}${CLEAN_VISIT.path}`, { routes: ['/profile/[username]/[templateSlug]'] });
    const restoreGlobals = installFakeDomGlobals(navigation.window);
    const root = createRoot(createFakeContainer());
    try {
      await act(async () => root.render(<PublicTemplate />));
      expect(lastDialogProps().open).toBe(false);

      await act(async () => {
        lastViewProps().onStartRun();
      });

      expect(lastDialogProps().open).toBe(true);
      expect(startRun).not.toHaveBeenCalled();
      expect(navigation.router.push).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
      restoreGlobals();
    }
  });

  it('starts the run with the name the dialog sends', async () => {
    const startRun = vi.fn().mockResolvedValue({ kind: 'ok', runId: 'run-1' });
    renderPublishedRoute(publishedClipyTemplate, { startRun });

    await lastDialogProps().onConfirm('Camping weekend');

    expect(startRun).toHaveBeenCalledWith('Camping weekend');
  });

  it('sends a visitor who is not signed in to sign in, and back here after', async () => {
    authState.isAuthenticated = false;
    authState.user = null;
    const startRun = vi.fn();
    renderPublishedRoute(publishedClipyTemplate, { startRun });

    await lastViewProps().onStartRun();

    expect(startRun).not.toHaveBeenCalled();
    expect(lastDialogProps().open).toBe(false);
    expect(navigation.pathname()).toBe('/login/');
    expect(new URLSearchParams(navigation.search()).get('next')).toBe(CLEAN_VISIT.path);
  });
});
