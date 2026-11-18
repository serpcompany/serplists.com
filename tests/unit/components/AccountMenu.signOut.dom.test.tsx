import { navigation } from '../../support/mockedNextNavigation';
import '../../support/mockedConsoleContext';
import React from 'react';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

const signedIn = vi.hoisted(() => ({ logout: (): Promise<{ ok: boolean; error?: string }> => Promise.resolve({ ok: true }) }));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    logout: () => signedIn.logout(),
    user: { email: 'alice@example.com', id: 'user-1', name: 'Alice', username: 'alice' },
  }),
}));

import { AccountMenu } from '@/components/layout/AccountMenu';

import { openTheMenu, renderSettled, theButtonOrMenuItemNamed, theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';
import { aSignOutTheServerAnswersLater, expectTheControlToLeaveOnlyOnceSignedOut } from '../../support/signOutControl';

theInMemoryBrowserAsTheWindow();

describe('AccountMenu Sign out', () => {
  it('leaves the page only once the server signed the user out, through signOutAndLeave', async () => {
    const signingOut = aSignOutTheServerAnswersLater();
    signedIn.logout = () => signingOut.promise;
    navigation.reset('/dashboard/templates/');
    await renderSettled(<AccountMenu />);
    await openTheMenu('Account menu');

    await expectTheControlToLeaveOnlyOnceSignedOut('Sign out', signingOut);
  });

  it('stays on the page and says why when the server did not sign the user out', async () => {
    signedIn.logout = () => Promise.resolve({ ok: false, error: 'Sign-out failed. Try again.' });
    navigation.reset('/dashboard/templates/');
    await renderSettled(<AccountMenu />);
    await openTheMenu('Account menu');
    const before = navigation.log.length;

    await act(async () => {
      fireEvent.click(theButtonOrMenuItemNamed('Sign out'));
    });

    expect(toast.error).toHaveBeenCalledWith('Sign-out failed. Try again.');
    expect(navigation.log.slice(before)).toEqual([]);
  });
});
