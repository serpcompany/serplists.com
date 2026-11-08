import '../../support/mockedToasts';
import React, { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { SecuritySection } from '@/components/account/SecuritySection';
import { authClient } from '@/lib/auth-client';
import { PASSWORD_TOO_SHORT_MESSAGE } from '@/lib/schemas/passwordLimits';

import { objectContaining } from '../../support/asymmetricMatchers';
import { deferred } from '../../support/deferred';
import { inputNamed, renderSettled, typeInto } from '../../support/renderInTheDom';

vi.mock('@/lib/auth-client', () => ({
  authClient: { changePassword: vi.fn(), revokeOtherSessions: vi.fn() },
}));

const changePassword = vi.mocked(authClient.changePassword);
const revokeOtherSessions = vi.mocked(authClient.revokeOtherSessions);

const press = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });

async function fillThePasswords(current: string, next: string, confirmation = next) {
  await renderSettled(<SecuritySection />);
  await typeInto(inputNamed('Current password'), current);
  await typeInto(inputNamed('New password'), next);
  await typeInto(inputNamed('Confirm new password'), confirmation);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('changing the password', () => {
  it('asks for both passwords before sending anything', async () => {
    await fillThePasswords('', 'correct horse battery');

    await press('Update password');

    expect(toast.error).toHaveBeenCalledWith('Enter your current password and a new password');
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('refuses a confirmation that does not match', async () => {
    await fillThePasswords('old password 1', 'correct horse battery', 'correct horse batteri');

    await press('Update password');

    expect(toast.error).toHaveBeenCalledWith('New passwords do not match');
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('refuses a new password the policy rejects', async () => {
    await fillThePasswords('old password 1', 'short');

    await press('Update password');

    expect(toast.error).toHaveBeenCalledWith(PASSWORD_TOO_SHORT_MESSAGE);
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('changes the password, signing out other sessions by default, and clears the fields', async () => {
    const saving = deferred<Awaited<ReturnType<typeof authClient.changePassword>>>();
    changePassword.mockReturnValue(saving.promise);
    await fillThePasswords('old password 1', 'correct horse battery');

    await press('Update password');
    expect(screen.getByRole('button', { name: 'Updating...' }).hasAttribute('disabled')).toBe(true);
    await act(async () => {
      saving.resolve({ data: { token: null, user: { id: 'user-1' } }, error: null });
    });

    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: 'old password 1',
      newPassword: 'correct horse battery',
      revokeOtherSessions: true,
    });
    expect(toast.success).toHaveBeenCalledWith('Password updated');
    expect(['Current password', 'New password', 'Confirm new password'].map((name) => inputNamed(name).value)).toEqual(['', '', '']);
    expect(screen.getByRole('button', { name: 'Update password' }).hasAttribute('disabled')).toBe(false);
  });

  it('keeps other sessions signed in when the switch is off', async () => {
    changePassword.mockResolvedValue({ data: { token: null, user: { id: 'user-1' } }, error: null });
    await fillThePasswords('old password 1', 'correct horse battery');

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Sign out other sessions' }));
    });
    await press('Update password');

    expect(changePassword).toHaveBeenCalledWith(objectContaining({ revokeOtherSessions: false }));
  });

  it("shows the server's refusal and keeps what was typed", async () => {
    changePassword.mockResolvedValue({ data: null, error: { status: 400, message: 'Invalid password', statusText: 'Bad Request' } });
    await fillThePasswords('wrong password', 'correct horse battery');

    await press('Update password');

    expect(toast.error).toHaveBeenCalledWith('Invalid password');
    expect(inputNamed('Current password').value).toBe('wrong password');
  });

  it('shows why the request failed when it never reached the server', async () => {
    changePassword.mockRejectedValue(new TypeError('Failed to fetch'));
    await fillThePasswords('old password 1', 'correct horse battery');

    await press('Update password');

    expect(toast.error).toHaveBeenCalledWith('Failed to fetch');
    expect(screen.getByRole('button', { name: 'Update password' }).hasAttribute('disabled')).toBe(false);
  });
});

describe('signing out other sessions', () => {
  it('signs out the other sessions and says so', async () => {
    const revoking = deferred<Awaited<ReturnType<typeof authClient.revokeOtherSessions>>>();
    revokeOtherSessions.mockReturnValue(revoking.promise);
    await renderSettled(<SecuritySection />);

    await press('Sign out other sessions');
    expect(screen.getByRole('button', { name: 'Signing out...' }).hasAttribute('disabled')).toBe(true);
    await act(async () => {
      revoking.resolve({ data: { status: true }, error: null });
    });

    expect(toast.success).toHaveBeenCalledWith('Signed out other sessions');
  });

  it("shows the server's refusal", async () => {
    revokeOtherSessions.mockResolvedValue({ data: null, error: { status: 429, message: 'Slow down', statusText: 'Too Many Requests' } });
    await renderSettled(<SecuritySection />);

    await press('Sign out other sessions');

    expect(toast.error).toHaveBeenCalledWith('Too many attempts. Please wait a few minutes and try again.');
  });

  it('shows why the request failed when it never reached the server', async () => {
    revokeOtherSessions.mockRejectedValue(new TypeError('Failed to fetch'));
    await renderSettled(<SecuritySection />);

    await press('Sign out other sessions');

    expect(toast.error).toHaveBeenCalledWith('Failed to fetch');
  });
});
