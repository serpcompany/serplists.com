import { navigation } from '../../support/mockedNextNavigation';
import { aFreshAuthPageInEachTest } from '../../support/mockedAuthPageEdges';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { authClient } from '@/lib/auth-client';
import { PASSWORD_TOO_SHORT_MESSAGE } from '@/lib/schemas/passwordLimits';
import ResetPassword from '@/views/ResetPassword';
import { pressTheButton } from '../../support/pressTheButton';
import { inputNamed, renderSettled, typeInto } from '../../support/renderInTheDom';

const session = vi.hoisted(() => ({ isAuthenticated: false, logout: vi.fn(async () => undefined) }));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => session,
}));

aFreshAuthPageInEachTest();

beforeEach(() => {
  session.logout.mockClear();
  session.isAuthenticated = false;
});

const openTheLink = async (url = '/reset-password/?token=AbC123') => {
  navigation.reset(url);
  await renderSettled(<ResetPassword />);
};

const submit = async (password: string, confirmPassword = password) => {
  await typeInto(inputNamed('New password'), password);
  await typeInto(inputNamed('Confirm password'), confirmPassword);
  await pressTheButton('Update password');
};

describe('Reset password link', () => {
  it('takes the token out of the address bar and keeps the rest of the address', async () => {
    await openTheLink('/reset-password/?token=AbC123&utm=mail#top');

    expect(navigation.url()).toBe('/reset-password/?utm=mail#top');
    expect(screen.getByRole('button', { name: 'Update password' })).toBeDefined();
  });

  it('leaves an address without a token as it is', async () => {
    await openTheLink('/reset-password/?error=INVALID_TOKEN');

    expect(navigation.url()).toBe('/reset-password/?error=INVALID_TOKEN');
    expect(screen.getByRole('link', { name: 'Request a new link' }).getAttribute('href')).toBe('/forgot-password/');
  });
});

describe('Reset password form', () => {
  it('refuses passwords that do not match, without calling the API', async () => {
    await openTheLink();
    await submit('long enough password', 'another long password');

    expect(toast.error).toHaveBeenCalledWith('Passwords do not match');
    expect(authClient.resetPassword).not.toHaveBeenCalled();
  });

  it('refuses a password the policy rejects, without calling the API', async () => {
    await openTheLink();
    await submit('short');

    expect(toast.error).toHaveBeenCalledWith(PASSWORD_TOO_SHORT_MESSAGE);
    expect(authClient.resetPassword).not.toHaveBeenCalled();
  });

  it('sets the new password with the token from the link, signs the old session out and opens sign in', async () => {
    session.isAuthenticated = true;
    vi.mocked(authClient.resetPassword).mockResolvedValue({ data: { status: true }, error: null });
    await openTheLink();
    await submit('a brand new password');

    expect(authClient.resetPassword).toHaveBeenCalledWith({ newPassword: 'a brand new password', token: 'AbC123' });
    expect(session.logout).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('Password updated. Please sign in again.');
    expect(navigation.pathname()).toBe('/login/');
  });

  it('shows the reason the API gives and stays on the form', async () => {
    vi.mocked(authClient.resetPassword).mockResolvedValue({
      data: null,
      error: { message: 'Token expired', status: 400, statusText: 'Bad Request' },
    });
    await openTheLink();
    await submit('a brand new password');

    expect(toast.error).toHaveBeenCalledWith('Token expired');
    expect(toast.success).not.toHaveBeenCalled();
    expect(navigation.pathname()).toBe('/reset-password/');
    expect(screen.getByRole('button', { name: 'Update password' }).hasAttribute('disabled')).toBe(false);
  });
});
