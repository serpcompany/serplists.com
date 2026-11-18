import { navigation } from '../../support/mockedNextNavigation';
import { aFreshAuthPageInEachTest } from '../../support/mockedAuthPageEdges';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { AuthStatusError } from '@/lib/auth/authErrors';
import { authClient, getAuthStatus } from '@/lib/auth-client';
import ForgotPassword from '@/views/ForgotPassword';
import { authStatusWith } from '../../fixtures/authStatus';
import { pressTheButton } from '../../support/pressTheButton';
import { inputNamed, renderSettled, typeInto } from '../../support/renderInTheDom';

aFreshAuthPageInEachTest();

const requestALinkFor = async (email: string) => {
  navigation.reset('/forgot-password/');
  await renderSettled(<ForgotPassword />);
  await typeInto(inputNamed('Email'), email);
  await pressTheButton('Send reset link');
};

const theFormIsStillShown = () => screen.queryByRole('button', { name: 'Send reset link' }) !== null;

describe('Forgot password page', () => {
  it('asks for a reset email that returns to the reset page, then says to check the inbox', async () => {
    vi.mocked(authClient.requestPasswordReset).mockResolvedValue({ data: { status: true }, error: null });

    await requestALinkFor('alice@example.com');

    expect(authClient.requestPasswordReset).toHaveBeenCalledWith({
      email: 'alice@example.com',
      redirectTo: `${navigation.window.location.origin}/reset-password/`,
    });
    expect(toast.success).toHaveBeenCalledWith('If an account exists, a reset link has been sent.');
    expect(document.body.textContent).toContain('Check your inbox for a reset link.');
    expect(theFormIsStillShown()).toBe(false);
  });

  it('sends nothing while email is unavailable, and says to contact support', async () => {
    vi.mocked(getAuthStatus).mockResolvedValue(authStatusWith({ emailAuthAvailable: false }));

    await requestALinkFor('alice@example.com');

    expect(authClient.requestPasswordReset).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Password reset email is temporarily unavailable. Please contact support.');
    expect(theFormIsStillShown()).toBe(true);
  });

  it('shows the reason the API refused and keeps the form', async () => {
    vi.mocked(authClient.requestPasswordReset).mockResolvedValue({
      data: null,
      error: { message: 'Invalid email', status: 400, statusText: 'Bad Request' },
    });

    await requestALinkFor('not-an-address@example');

    expect(toast.error).toHaveBeenCalledWith('Invalid email');
    expect(toast.success).not.toHaveBeenCalled();
    expect(theFormIsStillShown()).toBe(true);
  });

  it('tells the user how long to wait when the auth status is rate limited', async () => {
    vi.mocked(getAuthStatus).mockRejectedValue(new AuthStatusError(429, 30));

    await requestALinkFor('alice@example.com');

    expect(toast.error).toHaveBeenCalledWith('Too many attempts. Please try again in 30 seconds.');
    expect(screen.getByRole('button', { name: 'Send reset link' }).hasAttribute('disabled')).toBe(false);
  });
});
