import { act } from 'react';
import { cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, signInEmail, signUpEmail, toast } = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: { signIn: { email: signInEmail }, signUp: { email: signUpEmail }, getSession, signOut: vi.fn() },
}));
vi.mock('sonner', () => ({ toast }));

import { registerLeaveGuard } from '@/lib/navigation/leaveGuard';

import { mountAuth } from '../../support/authProviderHarness';

const PERSON = { id: 'user-1', email: 'person@example.com', name: 'Person', username: 'person' };
const signedIn = { data: { user: PERSON, session: { id: 'session-1' } }, error: null };
const signedOut = { data: null, error: null };

const otherTabs: BroadcastChannel[] = [];
const anotherTab = () => {
  const channel = new BroadcastChannel('serplists-auth');
  otherTabs.push(channel);
  return channel;
};

const reportsFrom = (channel: BroadcastChannel) => {
  const reports: unknown[] = [];
  channel.onmessage = (event: MessageEvent<unknown>) => reports.push(event.data);
  return reports;
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  otherTabs.splice(0).forEach((channel) => channel.close());
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('AuthProvider when another tab signs out', () => {
  const signOutInAnotherTab = async () => {
    getSession.mockResolvedValue(signedOut);
    anotherTab().postMessage({ userId: null });
  };

  it('signs this tab out, says so, and warns when the open page could not keep its unsaved changes', async () => {
    getSession.mockResolvedValue(signedIn);
    const auth = await mountAuth();
    const release = registerLeaveGuard({ message: 'Leave?', shouldConfirm: () => true, onLeaveConfirmed: () => undefined, onSessionEnding: () => false });

    await signOutInAnotherTab();

    await waitFor(() => expect(auth().user).toBeNull());
    expect(toast).toHaveBeenCalledWith('Your session ended. Sign in again.');
    expect(toast.error).toHaveBeenCalledWith('Your unsaved changes could not be kept.');
    release();
  });

  it('gives no warning when the open page kept its unsaved changes', async () => {
    getSession.mockResolvedValue(signedIn);
    const auth = await mountAuth();
    const release = registerLeaveGuard({ message: 'Leave?', shouldConfirm: () => true, onLeaveConfirmed: () => undefined, onSessionEnding: () => true });

    await signOutInAnotherTab();

    await waitFor(() => expect(auth().user).toBeNull());
    expect(toast).toHaveBeenCalledWith('Your session ended. Sign in again.');
    expect(toast.error).not.toHaveBeenCalled();
    release();
  });
});

describe('AuthProvider login', () => {
  it('reports a failed login, without throwing, when the request itself fails', async () => {
    getSession.mockResolvedValue(signedOut);
    signInEmail.mockRejectedValue(new TypeError('Failed to fetch'));
    const auth = await mountAuth();

    const result = await act(() => auth().login(PERSON.email, 'a-long-password-1'));

    expect(result).toEqual({ ok: false, error: 'Login failed', errorCode: 'UNKNOWN' });
    expect(auth().user).toBeNull();
  });
});

describe('AuthProvider register', () => {
  const signedOutWithASignUpThatNeedsNoEmailCheck = async () => {
    getSession.mockResolvedValue(signedOut);
    const auth = await mountAuth();
    signUpEmail.mockResolvedValue({ data: { token: 'session-token', user: PERSON }, error: null });
    return auth;
  };
  const registerThePerson = (auth: Awaited<ReturnType<typeof mountAuth>>) =>
    act(() => auth().register(PERSON.name, PERSON.email, 'a-long-password-1'));

  it('signs in an account that needs no email check, and tells the other tabs', async () => {
    const auth = await signedOutWithASignUpThatNeedsNoEmailCheck();
    const reports = reportsFrom(anotherTab());
    getSession.mockResolvedValue(signedIn);

    const result = await registerThePerson(auth);

    expect(result).toEqual({ ok: true, requiresEmailVerification: false });
    expect(auth().user?.id).toBe(PERSON.id);
    await waitFor(() => expect(reports).toEqual([{ userId: PERSON.id }]));
  });

  it('checks the session again when it cannot be read right after signing up', async () => {
    const auth = await signedOutWithASignUpThatNeedsNoEmailCheck();
    getSession.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(signedIn);

    const result = await registerThePerson(auth);

    expect(result).toEqual({ ok: true, requiresEmailVerification: false });
    await waitFor(() => expect(auth().user?.id).toBe(PERSON.id));
  });

  it('leaves the visitor signed out while their email waits to be checked', async () => {
    getSession.mockResolvedValue(signedOut);
    const auth = await mountAuth();
    signUpEmail.mockResolvedValue({ data: { token: null, user: PERSON }, error: null });

    const result = await registerThePerson(auth);

    expect(result).toEqual({ ok: true, requiresEmailVerification: true });
    expect(auth().user).toBeNull();
  });

  it('reports a failed registration, without throwing, when the request itself fails', async () => {
    getSession.mockResolvedValue(signedOut);
    signUpEmail.mockRejectedValue(new TypeError('Failed to fetch'));
    const auth = await mountAuth();

    const result = await registerThePerson(auth);

    expect(result).toEqual({ ok: false, error: 'Registration failed', errorCode: 'UNKNOWN' });
  });
});
