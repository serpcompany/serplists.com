import { navigation } from '../../support/mockedNextNavigation';
import { aFreshAuthPageInEachTest } from '../../support/mockedAuthPageEdges';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { getAuthStatus } from '@/lib/auth-client';
import { peekHandedOffLoginEmail, takeHandedOffLoginEmail } from '@/lib/auth/loginPrefill';
import { PASSWORD_TOO_SHORT_MESSAGE } from '@/lib/schemas/passwordLimits';
import Register from '@/views/Register';
import { authStatusWith } from '../../fixtures/authStatus';
import { pressTheButton } from '../../support/pressTheButton';
import { inputNamed, renderSettled, typeInto } from '../../support/renderInTheDom';

type RegisterResult = { ok: boolean; requiresEmailVerification?: boolean; error?: string };

const register = vi.hoisted(() =>
  vi.fn<(name: string, email: string, password: string, callbackURL?: string) => Promise<RegisterResult>>(),
);

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ register }),
}));

aFreshAuthPageInEachTest();

beforeEach(() => {
  register.mockReset().mockResolvedValue({ ok: true });
  takeHandedOffLoginEmail();
});

const signUp = async ({
  at = '/register/',
  password = 'a long enough password',
  confirmPassword = password,
}: { at?: string; password?: string; confirmPassword?: string } = {}) => {
  navigation.reset(at);
  await renderSettled(<Register />);
  await typeInto(inputNamed('Name'), 'Alice');
  await typeInto(inputNamed('Email'), 'alice@example.com');
  await typeInto(inputNamed('Password'), password);
  await typeInto(inputNamed('Confirm Password'), confirmPassword);
  await pressTheButton('Create account');
};

describe('Register form checks before it creates an account', () => {
  it('refuses passwords that do not match', async () => {
    await signUp({ confirmPassword: 'something else entirely' });

    expect(toast.error).toHaveBeenCalledWith('Passwords do not match');
    expect(register).not.toHaveBeenCalled();
  });

  it('refuses a password the policy rejects', async () => {
    await signUp({ password: 'short' });

    expect(toast.error).toHaveBeenCalledWith(PASSWORD_TOO_SHORT_MESSAGE);
    expect(register).not.toHaveBeenCalled();
  });

  it('creates no account while registration is unavailable, and says to contact support', async () => {
    vi.mocked(getAuthStatus).mockResolvedValue(authStatusWith({ accountRegistrationAvailable: false }));

    await signUp();

    expect(register).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      'Account email verification is temporarily unavailable. Please contact support.',
    );
    expect(navigation.pathname()).toBe('/register/');
  });
});

describe('Register once the account is created', () => {
  it('sends a new user who must verify to sign in, with the address handed over', async () => {
    vi.mocked(getAuthStatus).mockResolvedValue(authStatusWith({ emailVerificationRequired: true }));

    await signUp();

    expect(register).toHaveBeenCalledWith('Alice', 'alice@example.com', 'a long enough password', '/login/?verified=1');
    expect(toast.success).toHaveBeenCalledWith(
      'Account created. Check your email to verify your address before signing in.',
    );
    expect(peekHandedOffLoginEmail()).toBe('alice@example.com');
    expect(navigation.url()).toBe('/login/?verify_email=1');
  });

  it('asks for verification when the API says the new account needs it', async () => {
    register.mockResolvedValue({ ok: true, requiresEmailVerification: true });

    await signUp();

    expect(toast.success).toHaveBeenCalledWith(
      'Account created. Check your email to verify your address before signing in.',
    );
    expect(peekHandedOffLoginEmail()).toBe('alice@example.com');
  });

  it('opens the page the user was headed to when no verification is needed', async () => {
    await signUp({ at: '/register/?next=%2Fteam-invites%2Fabc%2F' });

    expect(toast.success).toHaveBeenCalledWith('Registration successful');
    expect(peekHandedOffLoginEmail()).toBeNull();
    expect(navigation.pathname()).toBe('/team-invites/abc/');
  });
});

describe('Register when the account is not created', () => {
  it('shows the reason the API gives', async () => {
    register.mockResolvedValue({ ok: false, error: 'User already exists' });

    await signUp();

    expect(toast.error).toHaveBeenCalledWith('User already exists');
    expect(navigation.pathname()).toBe('/register/');
  });

  it('says registration failed when the API gives no reason', async () => {
    register.mockResolvedValue({ ok: false });

    await signUp();

    expect(toast.error).toHaveBeenCalledWith('Registration failed.');
  });

  it('says an error occurred when the request itself fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    register.mockRejectedValue(new TypeError('Failed to fetch'));

    await signUp();

    expect(toast.error).toHaveBeenCalledWith('An error occurred during registration');
    expect(consoleError).toHaveBeenCalledWith('Registration error:', expect.any(TypeError));
    consoleError.mockRestore();
  });
});
