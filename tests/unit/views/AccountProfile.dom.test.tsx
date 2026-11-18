import { navigation } from '../../support/mockedNextNavigation';
import '../../support/mockedR2Uploads';
import React, { act } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { authClient } from '@/lib/auth-client';
import Account from '@/views/Account';
import { pressTheButton } from '../../support/pressTheButton';
import { queryClientsClearedAfterEachTest } from '../../support/queryClientsPerTest';
import { inputNamed, renderSettled, theInMemoryBrowserAsTheWindow, typeInto } from '../../support/renderInTheDom';

type AccountUser = { id: string; email: string; name: string; username: string; image: string };

const avatarUrl = 'https://cdn.example.com/avatars/user-1/a.png';
const signedIn = vi.hoisted(() => ({
  user: null as AccountUser | null,
  refreshProfile: vi.fn(async () => true),
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => signedIn,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: { updateUser: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), message: vi.fn(), success: vi.fn() },
}));

vi.mock('@/components/account/BillingSection', () => ({ BillingSection: () => <h2>Personal billing</h2> }));
vi.mock('@/components/account/AgentAccessSection', () => ({ AgentAccessSection: () => <h2>Run Keys</h2> }));
vi.mock('@/components/account/AccountOrganizationsSection', () => ({
  AccountOrganizationsSection: () => <h2>Organizations</h2>,
}));
vi.mock('@/components/account/SecuritySection', () => ({ SecuritySection: () => <h2>Security</h2> }));

theInMemoryBrowserAsTheWindow();
const aQueryClient = queryClientsClearedAfterEachTest();

const john = (): AccountUser => ({
  id: 'user-1',
  email: 'john@example.com',
  name: 'John Doe',
  username: 'johndoe',
  image: avatarUrl,
});

beforeEach(() => {
  signedIn.user = john();
  signedIn.refreshProfile.mockClear();
  vi.mocked(authClient.updateUser).mockReset().mockResolvedValue({ data: { status: true }, error: null });
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.message).mockClear();
  vi.mocked(toast.success).mockClear();
});

afterEach(() => cleanup());

const openAccount = async (url = '/dashboard/settings/') => {
  navigation.reset(url);
  const queryClient = aQueryClient();
  const invalidated = vi.spyOn(queryClient, 'invalidateQueries');
  const accountPage = () => (
    <QueryClientProvider client={queryClient}>
      <Account />
    </QueryClientProvider>
  );
  const page = await renderSettled(accountPage());
  const afterTheSessionChanges = (user: AccountUser | null) => {
    signedIn.user = user;
    return act(async () => page.rerender(accountPage()));
  };
  return { invalidated, afterTheSessionChanges };
};

const sectionHeadings = () => screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);

describe('Account settings sections', () => {
  it('lists Run Keys where they are on, on a local address', async () => {
    await openAccount('http://localhost/dashboard/settings/');

    expect(sectionHeadings()).toEqual(['Profile Information', 'Personal billing', 'Run Keys', 'Organizations', 'Security']);
    expect(document.body.textContent).toContain('Your profile, sign-in, Run Keys and Personal billing.');
  });

  it('leaves Run Keys out where they are off', async () => {
    await openAccount('https://serplists.com/dashboard/settings/');

    expect(sectionHeadings()).toEqual(['Profile Information', 'Personal billing', 'Organizations', 'Security']);
    expect(document.body.textContent).toContain('Your profile, sign-in and Personal billing.');
  });

  it('fills the profile form once the signed-in user arrives', async () => {
    signedIn.user = null;
    const page = await openAccount();
    expect(inputNamed('Full Name').value).toBe('');

    await page.afterTheSessionChanges(john());

    expect(inputNamed('Full Name').value).toBe('John Doe');
    expect(inputNamed('Username').value).toBe('johndoe');
  });

  it('keeps an unsaved edit when the same user refreshes, and drops it when another user signs in', async () => {
    const page = await openAccount();
    await typeInto(inputNamed('Full Name'), 'John Smith');

    await page.afterTheSessionChanges({ ...john(), image: '' });
    expect(inputNamed('Full Name').value).toBe('John Smith');

    await page.afterTheSessionChanges({ id: 'user-2', email: 'jane@example.com', name: 'Jane Roe', username: 'janeroe', image: '' });
    expect(inputNamed('Full Name').value).toBe('Jane Roe');
    expect(inputNamed('Username').value).toBe('janeroe');
  });
});

describe('Account profile update', () => {
  it('saves a changed name, refreshes the profile and the Templates that show the owner', async () => {
    const { invalidated } = await openAccount();
    await typeInto(inputNamed('Full Name'), 'John Smith');
    await pressTheButton('Update Profile');

    expect(authClient.updateUser).toHaveBeenCalledWith({ name: 'John Smith' });
    expect(signedIn.refreshProfile).toHaveBeenCalledTimes(1);
    expect(invalidated).toHaveBeenCalledWith({ queryKey: ['templates'] });
    expect(toast.success).toHaveBeenCalledWith('Profile updated successfully');
  });

  it('says there is nothing to save when nothing changed', async () => {
    await openAccount();
    await pressTheButton('Update Profile');

    expect(toast.message).toHaveBeenCalledWith('No profile changes to save');
    expect(authClient.updateUser).not.toHaveBeenCalled();
  });

  it('refuses a username that is too short, without calling the API', async () => {
    await openAccount();
    await typeInto(inputNamed('Username'), 'jo');
    await pressTheButton('Update Profile');

    expect(toast.error).toHaveBeenCalledWith('Username must be at least 3 characters long');
    expect(authClient.updateUser).not.toHaveBeenCalled();
  });

  it('shows the reason the API refused the change', async () => {
    vi.mocked(authClient.updateUser).mockResolvedValue({
      data: null,
      error: { message: 'Username is already taken', status: 422, statusText: 'Unprocessable Entity' },
    });
    await openAccount();
    await typeInto(inputNamed('Username'), 'janedoe');
    await pressTheButton('Update Profile');

    expect(toast.error).toHaveBeenCalledWith('Username is already taken');
    expect(toast.success).not.toHaveBeenCalled();
    expect(signedIn.refreshProfile).not.toHaveBeenCalled();
  });

  it('says the update failed when the request itself fails, and lets the user try again', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(authClient.updateUser).mockRejectedValue(new TypeError('Failed to fetch'));
    await openAccount();
    await typeInto(inputNamed('Full Name'), 'John Smith');
    await pressTheButton('Update Profile');

    expect(toast.error).toHaveBeenCalledWith('Failed to update profile');
    expect(consoleError).toHaveBeenCalledWith('Error updating profile:', expect.any(TypeError));
    expect(screen.getByRole('button', { name: 'Update Profile' }).hasAttribute('disabled')).toBe(false);
    consoleError.mockRestore();
  });

  it('does nothing before the signed-in user has loaded', async () => {
    signedIn.user = null;
    await openAccount();
    await pressTheButton('Update Profile');

    expect(authClient.updateUser).not.toHaveBeenCalled();
    expect(toast.message).not.toHaveBeenCalled();
  });
});

describe('Account avatar', () => {
  it('drops the avatar from the form once it is removed', async () => {
    await openAccount();
    await pressTheButton('Remove avatar');

    expect(authClient.updateUser).toHaveBeenCalledWith({ image: null });
    expect(screen.queryByRole('button', { name: 'Remove avatar' })).toBeNull();
  });
});
