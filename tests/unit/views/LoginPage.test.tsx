import '../../support/mockedNextNavigation';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { handOffLoginEmail, VERIFY_EMAIL_LOGIN_PATH } from '@/lib/auth/loginPrefill';
import Login from '@/views/Login';
import { createFakeContainer, FakeElement, findAll, installFakeDomGlobals, type FakeNode } from '../../fixtures/fakeDom';
import { navigation } from '../../support/nextNavigation';

const authState = vi.hoisted(() => ({ isAuthenticated: false }));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    login: vi.fn(),
    isAuthenticated: authState.isAuthenticated,
    isLoading: false,
  }),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    sendVerificationEmail: vi.fn(),
  },
  getAuthStatus: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
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
  let restoreGlobals: () => void = () => {};
  let root: Root | null = null;
  beforeAll(() => {
    restoreGlobals = installFakeDomGlobals(navigation.window);
    authState.isAuthenticated = true;
  });
  afterAll(() => {
    authState.isAuthenticated = false;
    restoreGlobals();
  });
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
  });

  const firstDestinationFrom = async (url: string) => {
    navigation.reset(url);
    vi.mocked(navigation.router.replace).mockClear();
    root = createRoot(createFakeContainer() as unknown as HTMLElement);
    await act(async () => root?.render(<Login />));
    return vi.mocked(navigation.router.replace).mock.calls[0]?.[0];
  };

  it.each(['/login/', '/login/?verified=1'])('opens the console home from %s', async (url) => {
    expect(await firstDestinationFrom(url)).toBe('/dashboard/templates/');
  });

  it('opens the page the user was headed to', async () => {
    expect(await firstDestinationFrom('/login/?next=%2Fdashboard%2Fruns%2F')).toBe('/dashboard/runs/');
  });
});

describe('Login email handoff from sign-up', () => {
  let restoreGlobals: () => void = () => {};
  let root: Root | null = null;
  beforeAll(() => {
    restoreGlobals = installFakeDomGlobals(navigation.window);
  });
  afterAll(() => restoreGlobals());
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
  });

  const mountLogin = async () => {
    const container = createFakeContainer();
    root = createRoot(container as unknown as HTMLElement);
    await act(async () => root?.render(<Login />));
    return container;
  };

  const emailField = (container: FakeNode) => {
    const [field] = findAll(
      container,
      (node) => node instanceof FakeElement && node.nodeName === 'INPUT' && node.getAttribute('id') === 'email',
    );
    return field as FakeElement & { value?: string };
  };

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
    act(() => root?.unmount());

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

  it('moves the address of a link sent before it left the URL into the entry', async () => {
    navigation.reset('/login/?verify_email=1&email=alice%40example.com&next=%2Fteam-invites%2Fabc%2F');

    const container = await mountLogin();

    expect(emailField(container).value).toBe('alice@example.com');
    expect(navigation.url()).toBe('/login/?next=%2Fteam-invites%2Fabc%2F');
    expect(navigation.window.history.state).toMatchObject({ email: 'alice@example.com' });
  });
});
