import { navigation } from '../../support/mockedNextNavigation';
import React, { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { renderSettled, theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';

import { DevLoginBar } from '@/components/DevLoginBar';
import { aSignOutTheServerAnswersLater, expectTheControlToLeaveOnlyOnceSignedOut } from '../../support/signOutControl';

const auth = vi.hoisted(() => ({
  login: vi.fn<(email: string, password: string) => Promise<{ ok: boolean; error?: string }>>(),
  logout: (): Promise<{ ok: boolean; error?: string }> => Promise.resolve({ ok: true }),
  user: null as { email: string; name: string } | null,
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ login: auth.login, logout: () => auth.logout(), user: auth.user }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

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

describe('DevLoginBar quick logins', () => {
  const mountOnTheLoginPage = async () => {
    unmountThePreviousBar();
    navigation.reset('/login/');
    const { unmount } = await renderSettled(<DevLoginBar />);
    unmountThePreviousBar = unmount;
  };

  const press = (name: string) =>
    act(async () => {
      fireEvent.click(screen.getByRole('button', { name }));
    });

  afterEach(() => {
    auth.user = null;
    auth.login.mockReset();
    auth.logout = () => Promise.resolve({ ok: true });
    vi.clearAllMocks();
  });

  it('signs in as a test user and goes to the dashboard', async () => {
    auth.login.mockResolvedValue({ ok: true });
    await mountOnTheLoginPage();

    await press('John (Free)');

    expect(auth.login).toHaveBeenCalledWith('john@test.com', 'password123');
    expect(toast.success).toHaveBeenCalledWith('Logged in as John (Free)');
    expect(navigation.pathname()).toBe('/dashboard/');
  });

  it("shows the server's reason, or how to reset the dev passwords, when a sign-in fails", async () => {
    auth.login.mockResolvedValueOnce({ ok: false, error: 'Invalid email or password' }).mockResolvedValueOnce({ ok: false });
    await mountOnTheLoginPage();

    await press('Jane (Pro)');
    await press('Jane (Pro)');

    expect(vi.mocked(toast.error).mock.calls).toEqual([
      ['Invalid email or password'],
      ['Login failed. If this dev password was changed locally, run pnpm run db:reset:test-user-passwords.'],
    ]);
    expect(navigation.pathname()).toBe('/login/');
  });

  it('points to the dev server log when the sign-in request throws', async () => {
    auth.login.mockRejectedValue(new TypeError('Failed to fetch'));
    await mountOnTheLoginPage();

    await press('Bob (Free)');

    expect(toast.error).toHaveBeenCalledWith('Login error - check the dev server log (tmp/logs/dev-all.log).');
  });

  it('names the signed-in user by email when they have no name, and says why Logout failed', async () => {
    auth.user = { email: 'admin@test.com', name: '' };
    auth.logout = () => Promise.resolve({ ok: false, error: 'Sign-out failed' });
    await mountOnTheLoginPage();

    expect(screen.getByText('admin@test.com')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Admin (Pro)' }).hasAttribute('disabled')).toBe(true);
    await press('Logout');

    expect(toast.error).toHaveBeenCalledWith('Sign-out failed');
  });

  it('hides behind a small button and comes back from it', async () => {
    await mountOnTheLoginPage();

    await act(async () => {
      fireEvent.click(screen.getByTitle('Hide Dev Bar'));
    });
    expect(screen.queryByText(/DEV MODE/)).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTitle('Show Dev Login Bar'));
    });

    expect(screen.getByText(/DEV MODE/)).toBeTruthy();
  });

  it('stays hidden on the public Template Library', async () => {
    expect(await textAfterMountingAt('/templates/')).toBe('');
  });
});
