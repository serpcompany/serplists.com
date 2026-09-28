import { describe, expect, it, vi } from 'vitest';
import { submitPasswordReset } from '@/lib/auth/passwordReset';

describe('submitPasswordReset', () => {
  it('drops the signed-in state before reporting success, since the reset revoked this session too', async () => {
    const events: string[] = [];
    const resetPassword = vi.fn(async () => {
      events.push('reset');
      return { data: { status: true }, error: null };
    });
    const signOutLocally = vi.fn(async () => {
      events.push('signed-out');
    });

    const result = await submitPasswordReset({ resetPassword, signOutLocally, isSignedIn: true });

    expect(result).toEqual({ ok: true });
    expect(events).toEqual(['reset', 'signed-out']);
  });

  it('does not sign out a visitor who was not signed in', async () => {
    const signOutLocally = vi.fn(async () => undefined);

    const result = await submitPasswordReset({
      resetPassword: async () => ({ data: { status: true }, error: null }),
      signOutLocally,
      isSignedIn: false,
    });

    expect(result).toEqual({ ok: true });
    expect(signOutLocally).not.toHaveBeenCalled();
  });

  it('keeps the session when the reset fails', async () => {
    const signOutLocally = vi.fn(async () => undefined);

    const rejected = await submitPasswordReset({
      resetPassword: async () => ({ data: null, error: { message: 'Invalid token' } }),
      signOutLocally,
      isSignedIn: true,
    });
    const thrown = await submitPasswordReset({
      resetPassword: async () => {
        throw new TypeError('Failed to fetch');
      },
      signOutLocally,
      isSignedIn: true,
    });

    expect(rejected).toEqual({ ok: false, message: 'Invalid token' });
    expect(thrown).toEqual({ ok: false, message: 'Unable to reset password' });
    expect(signOutLocally).not.toHaveBeenCalled();
  });

  it('still reports success when clearing the local session fails', async () => {
    const result = await submitPasswordReset({
      resetPassword: async () => ({ data: { status: true }, error: null }),
      signOutLocally: async () => {
        throw new Error('network');
      },
      isSignedIn: true,
    });

    expect(result).toEqual({ ok: true });
  });
});
