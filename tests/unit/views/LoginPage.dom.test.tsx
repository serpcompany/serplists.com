import { navigation } from '../../support/mockedNextNavigation';
import '../../support/mockedAuthPageEdges';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { handOffLoginEmail, VERIFY_EMAIL_LOGIN_PATH } from '@/lib/auth/loginPrefill';
import Login from '@/views/Login';
import { inputNamed, renderSettled, theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';

const authState = vi.hoisted(() => ({ isAuthenticated: false }));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    login: vi.fn(),
    isAuthenticated: authState.isAuthenticated,
    isLoading: false,
  }),
}));

const renderAt = (url: string) => {
  navigation.reset(url);
  return renderToStaticMarkup(<Login />);
};

describe('Login page', () => {
  it('uses the feature-wired sign-in surface without dead auth affordances', () => {
    const html = renderAt('/login/');

    expect(html).toContain('Welcome back');
    expect(html).toContain('Forgot password?');
    expect(html).toContain('Sign in');
    expect(html).not.toContain('Remember me for 30 days');
    expect(html).not.toContain('or continue with');
    expect(html).not.toContain('Google');
    expect(html).not.toContain('GitHub');
    expect(html).not.toContain('What happens after sign in');
  });

  it('offers a new verification email when the verification link failed', () => {
    const html = renderAt('/login/?verified=1&error=token_expired');

    expect(html).toContain('Resend verification email');
    expect(html).toContain('That verification link has expired.');
    expect(html).not.toContain('Email verified');
  });

  it('carries the return path to sign-up so a new invitee comes back to the invite', () => {
    const html = renderAt('/login/?next=%2Fteam-invites%2Fabc%2F%3Fx%3D1%23h');

    expect(html).toContain('href="/register/?next=%2Fteam-invites%2Fabc%2F%3Fx%3D1%23h"');
  });

  it('reads the return path from next after the email verification round trip', () => {
    const html = renderAt('/login/?verified=1&next=%2Fteam-invites%2Fabc%2F');

    expect(html).toContain('href="/register/?next=%2Fteam-invites%2Fabc%2F"');
  });

  it('does not offer a resend after a successful verification', () => {
    expect(renderAt('/login/?verified=1')).not.toContain('Resend verification email');
  });
});

describe('Login once signed in, which leaves for the return path or the console home', () => {
  theInMemoryBrowserAsTheWindow();
  beforeAll(() => {
    authState.isAuthenticated = true;
  });
  afterAll(() => {
    authState.isAuthenticated = false;
  });

  const firstDestinationFrom = async (url: string) => {
    navigation.reset(url);
    vi.mocked(navigation.router.replace).mockClear();
    await renderSettled(<Login />);
    return vi.mocked(navigation.router.replace).mock.calls[0]?.[0];
  };

  it.each(['/login/', '/login/?verified=1'])('opens the dashboard home, which opens the remembered context, from %s', async (url) => {
    expect(await firstDestinationFrom(url)).toBe('/dashboard/');
  });

  it('opens the page the user was headed to', async () => {
    expect(await firstDestinationFrom('/login/?next=%2Fdashboard%2Fruns%2F')).toBe('/dashboard/runs/');
  });
});

describe('Login once signed in on a page where Google Tag Manager has loaded', () => {
  theInMemoryBrowserAsTheWindow({ dataLayer: [{ event: 'gtm.js' }] });
  beforeAll(() => {
    authState.isAuthenticated = true;
  });
  afterAll(() => {
    authState.isAuthenticated = false;
  });

  it('loads a sensitive return path as a new document, so the tag manager never sees its address change', async () => {
    navigation.reset('/login/?next=%2Fteam-invites%2Fabc%2F');
    vi.mocked(navigation.router.replace).mockClear();
    await renderSettled(<Login />);

    expect(navigation.documentLoads).toEqual([
      { kind: 'replace', href: `${navigation.window.location.origin}/team-invites/abc/` },
    ]);
    expect(navigation.router.replace).not.toHaveBeenCalled();
  });
});

describe('Login after an email verification link failed', () => {
  theInMemoryBrowserAsTheWindow();
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
  });

  const expiredLinkNotice = 'That verification link has expired. Enter your email to get a new one.';

  it('says why once, takes the one-shot parameters out of the address and keeps the notice on the page', async () => {
    navigation.reset('/login/?verified=1&error=token_expired&next=%2Fdashboard%2Fruns%2F');
    const { container } = await renderSettled(<Login />);

    expect(toast.error).toHaveBeenCalledWith(expiredLinkNotice, { id: 'email-verification-failed' });
    expect(navigation.url()).toBe('/login/?next=%2Fdashboard%2Fruns%2F');
    expect(container.textContent).toContain(expiredLinkNotice);
  });

  it('shows the newer failure when another failed link opens in the same tab', async () => {
    navigation.reset('/login/?verified=1&error=token_expired');
    const { container } = await renderSettled(<Login />);

    await act(async () => {
      navigation.router.push('/login/?verified=1&error=invalid_token');
      await navigation.settle();
    });

    expect(container.textContent).toContain('That verification link is invalid. Enter your email to get a new one.');
    expect(container.textContent).not.toContain(expiredLinkNotice);
  });
});

describe('Login email handoff from sign-up', () => {
  theInMemoryBrowserAsTheWindow();
  let unmountTheLoginPage: () => void = () => {};

  const mountLogin = async () => {
    const { container, unmount } = await renderSettled(<Login />);
    unmountTheLoginPage = unmount;
    return container;
  };

  const emailField = (container: HTMLElement) => inputNamed('Email', container);

  it('fills the form with the address sign-up handed over, and keeps it out of the URL', async () => {
    navigation.reset(VERIFY_EMAIL_LOGIN_PATH);
    handOffLoginEmail('alice+new@example.com');

    const container = await mountLogin();

    expect(emailField(container).value).toBe('alice+new@example.com');
    expect(navigation.url()).toBe('/login/');
    expect(navigation.window.history.state).toMatchObject({ email: 'alice+new@example.com' });
  });

  it('takes the handed-over address once', async () => {
    navigation.reset(VERIFY_EMAIL_LOGIN_PATH);
    handOffLoginEmail('alice+new@example.com');
    await mountLogin();
    unmountTheLoginPage();

    navigation.reset('/login/');
    const container = await mountLogin();

    expect(emailField(container).value ?? '').toBe('');
    expect(navigation.window.history.state).toBeNull();
  });

  it('fills the form again when its history entry is reloaded', async () => {
    navigation.reset('/login/', { state: { email: 'alice+new@example.com', __NA: true } });

    const container = await mountLogin();

    expect(emailField(container).value).toBe('alice+new@example.com');
  });

  it('keeps a handed-over address in the entry of an address that carries no one-shot parameters', async () => {
    navigation.reset('/login/?next=%2Fdashboard%2Fruns%2F');
    handOffLoginEmail('alice+new@example.com');

    const container = await mountLogin();

    expect(emailField(container).value).toBe('alice+new@example.com');
    expect(navigation.url()).toBe('/login/?next=%2Fdashboard%2Fruns%2F');
    expect(navigation.window.history.state).toMatchObject({ email: 'alice+new@example.com' });
  });

  it('moves the address of a link sent before it left the URL into the entry', async () => {
    navigation.reset('/login/?verify_email=1&email=alice%40example.com&next=%2Fteam-invites%2Fabc%2F');

    const container = await mountLogin();

    expect(emailField(container).value).toBe('alice@example.com');
    expect(navigation.url()).toBe('/login/?next=%2Fteam-invites%2Fabc%2F');
    expect(navigation.window.history.state).toMatchObject({ email: 'alice@example.com' });
  });
});
