import { navigation } from '../../support/mockedNextNavigation';
import React from 'react';
import { describe, it, vi } from 'vitest';

const signedIn = vi.hoisted(() => ({ logout: (): Promise<{ ok: boolean }> => Promise.resolve({ ok: true }) }));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    logout: () => signedIn.logout(),
    user: { email: 'alice@example.com', id: 'user-1', name: 'Alice', username: 'alice' },
  }),
}));

import { AccountMenu } from '@/components/layout/AccountMenu';

import { openTheMenu, renderSettled, theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';
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
});
