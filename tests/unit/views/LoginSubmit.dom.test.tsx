import { navigation } from '../../support/mockedNextNavigation';
import { aFreshAuthPageInEachTest } from '../../support/mockedAuthPageEdges';
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { AuthStatusError } from '@/lib/auth/authErrors';
import { authClient, getAuthStatus } from '@/lib/auth-client';
import { DEV_TEST_USER_DEFAULT_PASSWORD } from '@/lib/auth/devUsers';
import Login from '@/views/Login';
import { authStatusWith } from '../../fixtures/authStatus';
import { pressTheButton } from '../../support/pressTheButton';
import { inputNamed, renderSettled, typeInto } from '../../support/renderInTheDom';

type LoginResult = { ok: boolean; error?: string; errorCode?: string };

const login = vi.hoisted(() => vi.fn<(email: string, password: string) => Promise<LoginResult>>());

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ login, isAuthenticated: false, isLoading: false }),
}));

aFreshAuthPageInEachTest();

beforeEach(() => {
  login.mockReset();
  vi.mocked(authClient.sendVerificationEmail).mockResolvedValue({ data: { status: true }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const openLogin = async (url = '/login/') => {
  navigation.reset(url);
  await renderSettled(<Login />);
};

const signIn = async (email = 'alice@example.com') => {
  await typeInto(inputNamed('Email'), email);
  await typeInto(inputNamed('Password'), 'correct horse');
  await pressTheButton('Sign in');
};

const signInUnverified = async (url = '/login/') => {
  login.mockResolvedValueOnce({ ok: false, errorCode: 'EMAIL_NOT_VERIFIED', error: 'Email not verified' });
  await openLogin(url);
  await signIn();
};

const verifyNotice = () => screen.queryByText('Verify your email before signing in.');

describe('Login form submit', () => {
  it('signs in with the email and password typed', async () => {
    login.mockResolvedValue({ ok: true });
    await openLogin();
    await signIn();

    expect(login).toHaveBeenCalledWith('alice@example.com', 'correct horse');
    expect(toast.success).toHaveBeenCalledWith('Login successful');
  });

  it('shows the reason the API gives, or a plain one when it gives none', async () => {
    login.mockResolvedValueOnce({ ok: false, error: 'Account locked' }).mockResolvedValueOnce({ ok: false });
    await openLogin();
    await signIn();
    await pressTheButton('Sign in');

    expect(vi.mocked(toast.error).mock.calls).toEqual([['Account locked'], ['Invalid email or password']]);
  });

  it('says an error occurred when the request itself fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    login.mockRejectedValue(new TypeError('Failed to fetch'));
    await openLogin();
    await signIn();

    expect(toast.error).toHaveBeenCalledWith('An error occurred during login');
    expect(consoleError).toHaveBeenCalledWith('Login error:', expect.any(TypeError));
    expect(screen.getByRole('button', { name: 'Sign in' }).hasAttribute('disabled')).toBe(false);
    consoleError.mockRestore();
  });

  it('asks an unverified user to verify, then drops the notice once they sign in', async () => {
    await signInUnverified();

    expect(toast.error).toHaveBeenCalledWith('Email not verified. Check your inbox or resend verification.');
    expect(verifyNotice()).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeDefined();

    login.mockResolvedValue({ ok: true });
    await pressTheButton('Sign in');

    expect(verifyNotice()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Resend verification email' })).toBeNull();
  });
});

describe('Login resend verification email', () => {
  it('sends a new link for the unverified address that returns to sign in with the return path', async () => {
    await signInUnverified('/login/?next=%2Fteam-invites%2Fabc%2F');
    await pressTheButton('Resend verification email');

    expect(authClient.sendVerificationEmail).toHaveBeenCalledWith({
      email: 'alice@example.com',
      callbackURL: '/login/?verified=1%26next%3D%252Fteam-invites%252Fabc%252F',
    });
    expect(toast.success).toHaveBeenCalledWith('Verification email sent.');
  });

  it('asks for the address first after a failed link with no email typed', async () => {
    await openLogin('/login/?verified=1&error=token_expired');
    await pressTheButton('Resend verification email');

    expect(toast.error).toHaveBeenCalledWith('Enter your email first.');
    expect(getAuthStatus).not.toHaveBeenCalled();
  });

  it('sends nothing while email is unavailable, and says to contact support', async () => {
    vi.mocked(getAuthStatus).mockResolvedValue(authStatusWith({ emailAuthAvailable: false }));
    await signInUnverified();
    await pressTheButton('Resend verification email');

    expect(authClient.sendVerificationEmail).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenLastCalledWith('Verification email is temporarily unavailable. Please contact support.');
  });

  it('shows the reason the API refused the resend', async () => {
    vi.mocked(authClient.sendVerificationEmail).mockResolvedValue({
      data: null,
      error: { message: 'Email already verified', status: 400, statusText: 'Bad Request' },
    });
    await signInUnverified();
    await pressTheButton('Resend verification email');

    expect(toast.error).toHaveBeenLastCalledWith('Email already verified');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('says how long to wait when the resend is rate limited', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(getAuthStatus).mockRejectedValue(new AuthStatusError(429, 120));
    await signInUnverified();
    await pressTheButton('Resend verification email');

    expect(toast.error).toHaveBeenLastCalledWith('Too many attempts. Please try again in 2 minutes.');
    expect(consoleError).toHaveBeenCalledWith('Resend verification error:', expect.any(AuthStatusError));
    expect(screen.getByRole('button', { name: 'Resend verification email' }).hasAttribute('disabled')).toBe(false);
    consoleError.mockRestore();
  });
});

describe('Login dev personas', () => {
  it('fills a seeded persona and the default seed password outside production', async () => {
    await openLogin();
    await pressTheButton('Fill John');

    expect(inputNamed('Email').value).toBe('john@test.com');
    expect(inputNamed('Password').value).toBe(DEV_TEST_USER_DEFAULT_PASSWORD);
  });

  it('offers no persona buttons in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await openLogin();

    expect(screen.queryByRole('button', { name: 'Fill John' })).toBeNull();
    expect(document.body.textContent).not.toContain(DEV_TEST_USER_DEFAULT_PASSWORD);
  });
});
