import { navigation } from '../../support/mockedNextNavigation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { renderSettled, theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';

import { DevLoginBar } from '@/components/DevLoginBar';
import { aSignOutTheServerAnswersLater, expectTheControlToLeaveOnlyOnceSignedOut } from '../../support/signOutControl';

const auth = vi.hoisted(() => ({
  logout: (): Promise<{ ok: boolean }> => Promise.resolve({ ok: true }),
  user: null as { email: string; name: string } | null,
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ login: vi.fn(), logout: () => auth.logout(), user: auth.user }),
}));

theInMemoryBrowserAsTheWindow();
let unmountThePreviousBar: () => void = () => {};

const textAfterMountingAt = async (url: string) => {
  unmountThePreviousBar();
  navigation.reset(url);
  const { container, unmount } = await renderSettled(<DevLoginBar />);
  unmountThePreviousBar = unmount;
  return container.textContent;
};

describe("DevLoginBar, which shows the page's port and so renders only after mount", () => {
  it('stays hidden on blank template editor routes', async () => {
    expect(await textAfterMountingAt('/dashboard/templates/new')).toBe('');
    expect(await textAfterMountingAt('/dashboard/templates/new/')).toBe('');
  });

  it('stays hidden on authenticated dashboard routes used for design QA', async () => {
    expect(await textAfterMountingAt('/dashboard')).toBe('');
    expect(await textAfterMountingAt('/dashboard/templates/')).toBe('');
    expect(await textAfterMountingAt('/dashboard/runs/run-1/')).toBe('');
  });

  it('still renders on the login route in development', async () => {
    expect(await textAfterMountingAt('/login')).toContain('DEV MODE');
    expect(await textAfterMountingAt('/login/')).toContain('DEV MODE');
  });

  it('renders nothing on the server, so hydration matches', () => {
    navigation.reset('/login/');

    expect(renderToStaticMarkup(<DevLoginBar />)).toBe('');
  });

  it('leaves the page on Logout only once the server signed the user out, through signOutAndLeave', async () => {
    const signingOut = aSignOutTheServerAnswersLater();
    auth.user = { email: 'admin@test.com', name: 'Admin' };
    auth.logout = () => signingOut.promise;
    try {
      unmountThePreviousBar();
      navigation.reset('/login/');
      await renderSettled(<DevLoginBar />);

      await expectTheControlToLeaveOnlyOnceSignedOut('Logout', signingOut);
    } finally {
      auth.user = null;
    }
  });
});
