import { describe, expect, it, vi } from 'vitest';

import {
  SESSION_UNCONFIRMED_MESSAGE,
  resolveSignInSession,
  type SessionCheck,
} from '@/contexts/authSession';

const signInResponseWithoutUsername = {
  redirect: false,
  token: 'session-token',
  user: { id: 'user-john', email: 'john@test.com', name: 'John' },
};
const sessionUserWithUsername = { id: 'user-john', email: 'john@test.com', name: 'John', username: 'john' };
const sessionReadWithUsername: SessionCheck = {
  kind: 'authenticated',
  user: sessionUserWithUsername,
  session: { user: sessionUserWithUsername, session: { id: 'session-1' } },
};

describe('resolveSignInSession', () => {
  it('stores the session user, which has the username the sign-in response leaves out', async () => {
    const readSession = vi.fn(async () => sessionReadWithUsername);

    const outcome = await resolveSignInSession(signInResponseWithoutUsername, readSession);

    expect(readSession).toHaveBeenCalledTimes(1);
    expect(outcome.result).toEqual({ ok: true });
    expect(outcome.sessionToStore).toMatchObject({ kind: 'authenticated', user: { username: 'john' } });
    expect(outcome.sessionToStore).toEqual(sessionReadWithUsername);
  });

  it.each([
    ['cannot be read', async (): Promise<SessionCheck> => ({ kind: 'unknown', status: 503 })],
    ['throws', async (): Promise<SessionCheck> => { throw new Error('offline'); }],
    ['has no user yet', async (): Promise<SessionCheck> => ({ kind: 'unauthenticated' })],
  ])('keeps the sign-in user when the session %s, since the sign-in itself worked', async (_name, readSession) => {
    const outcome = await resolveSignInSession(signInResponseWithoutUsername, readSession);

    expect(outcome.result).toEqual({ ok: true });
    expect(outcome.sessionToStore).toMatchObject({ kind: 'authenticated', user: { id: 'user-john', email: 'john@test.com' } });
  });

  it('keeps the current state when neither answer has a user and the session could not be read', async () => {
    const outcome = await resolveSignInSession({ redirect: false }, async () => ({ kind: 'unknown' }));

    expect(outcome).toEqual({
      sessionToStore: null,
      result: { ok: false, error: SESSION_UNCONFIRMED_MESSAGE, errorCode: 'UNKNOWN' },
    });
  });

  it('reports a failed sign-in when the server says there is no session and sign-in gave no user', async () => {
    const outcome = await resolveSignInSession(null, async () => ({ kind: 'unauthenticated' }));

    expect(outcome).toEqual({
      sessionToStore: { kind: 'unauthenticated' },
      result: { ok: false, error: 'Unable to establish session', errorCode: 'UNKNOWN' },
    });
  });
});
