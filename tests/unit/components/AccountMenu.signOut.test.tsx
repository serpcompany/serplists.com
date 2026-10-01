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

vi.mock('@/components/ui/dropdown-menu', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/dropdown-menu')>()),
  ...(await import('../../support/overlaysInPlace')).dropdownMenuItemsAsButtons,
}));

import { AccountMenu } from '@/components/layout/AccountMenu';

import { aFakeDomForEachTest } from '../../support/fakeDomRoots';
import { aSignOutTheServerAnswersLater, expectTheControlToLeaveOnlyOnceSignedOut } from '../../support/signOutControl';

const fakeDom = aFakeDomForEachTest(navigation.window);

describe('AccountMenu Sign out', () => {
  it('leaves the page only once the server signed the user out, through signOutAndLeave', async () => {
    const signingOut = aSignOutTheServerAnswersLater();
    signedIn.logout = () => signingOut.promise;
    navigation.reset('/dashboard/templates/');
    const { container } = await fakeDom.render(<AccountMenu />);

    await expectTheControlToLeaveOnlyOnceSignedOut(container, 'Sign out', signingOut);
  });
});
