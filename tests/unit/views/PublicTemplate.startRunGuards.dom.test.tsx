import { act } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authState,
  installNavigationWindow,
  lastDialogProps,
  lastViewProps,
  mockDialogProps,
  openThePublishedRouteInTheDom,
  publishedClipyTemplate,
  resetToASignedInUserInPersonal,
  restoreNavigationWindow,
  workspaceState,
} from '../../support/publicTemplatePage';
import { analytics } from '@/lib/analytics';
import { navigation } from '../../support/nextNavigation';
import { firstOf } from '../../support/elements';

beforeAll(installNavigationWindow);
afterAll(restoreNavigationWindow);

beforeEach(() => {
  resetToASignedInUserInPersonal();
  mockDialogProps.mockReset();
  vi.mocked(analytics.trackTemplateView).mockClear();
});

afterEach(() => cleanup());

const startRunButtons = () => screen.getAllByRole('button', { name: 'Start Run' });

const pressStartRun = () =>
  act(async () => {
    fireEvent.click(firstOf(startRunButtons()));
  });

describe('PublicTemplate view tracking', () => {
  it('tracks no view while the Template loads, and one view of the Template once it is shown', async () => {
    await openThePublishedRouteInTheDom(publishedClipyTemplate, { modelOverrides: { template: null, loading: true } });
    expect(analytics.trackTemplateView).not.toHaveBeenCalled();

    cleanup();
    await openThePublishedRouteInTheDom(publishedClipyTemplate);
    expect(vi.mocked(analytics.trackTemplateView).mock.calls).toEqual([
      [publishedClipyTemplate.id, publishedClipyTemplate.title],
    ]);
  });
});

describe('PublicTemplate Start Run before a run can start', () => {
  it('cannot be pressed while the active Organization is still loading', async () => {
    workspaceState.isWorkspaceLoading = true;
    await openThePublishedRouteInTheDom(publishedClipyTemplate);
    const addressBefore = navigation.url();

    expect(startRunButtons().map((button) => button.hasAttribute('disabled'))).toEqual([true, true]);
    await pressStartRun();
    await act(async () => {
      lastViewProps().onStartRun();
    });

    expect(lastDialogProps().open).toBe(false);
    expect(navigation.url()).toBe(addressBefore);
  });

  it('sends a visitor who is not signed in to sign in, and back, when the Template has no public owner address to run it at', async () => {
    authState.isAuthenticated = false;
    authState.user = null;
    const ownerless = { ...publishedClipyTemplate, ownerProfile: { username: '' } };
    await openThePublishedRouteInTheDom(ownerless);
    expect(lastViewProps().ownerPath).toBeNull();

    await pressStartRun();

    expect(lastDialogProps().open).toBe(false);
    expect(navigation.url()).toBe('/login/?next=%2Fprofile%2Falice%2Freviewed-clipy-checklist');
  });
});
