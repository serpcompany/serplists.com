import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/contexts/sessionSync', async (importOriginal) =>
  (await import('../../support/sessionSyncModule')).sessionSyncModuleWith(importOriginal, () => ({}), {
    startSessionKeepAlive: () => () => undefined,
  }),
);

import { mountAuth } from '../../support/authProviderHarness';

const SESSION_TOKEN = 'the-session-token-only-the-httponly-cookie-holds';
const PERSON = {
  id: 'user-1',
  email: 'person@example.com',
  name: 'Person',
  username: 'person',
  emailVerified: true,
  image: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};
const SESSION = { id: 'session-1', token: SESSION_TOKEN, userId: PERSON.id, expiresAt: '2026-11-01T00:00:00.000Z' };

const jsonAnswer = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

function anAuthApiWhoseAnswersCarryTheToken() {
  let signedIn = false;
  const fetchStandIn = vi.fn(async (input: string | URL | Request) => {
    const { pathname } = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    if (pathname.endsWith('/sign-in/email')) {
      signedIn = true;
      return jsonAnswer({ redirect: false, token: SESSION_TOKEN, user: PERSON });
    }
    return jsonAnswer(signedIn ? { session: SESSION, user: PERSON } : null);
  });
  vi.stubGlobal('fetch', fetchStandIn);
  return fetchStandIn;
}

const everythingInWebStorage = () =>
  [window.localStorage, window.sessionStorage]
    .flatMap((storage) =>
      Array.from({ length: storage.length }, (_, index) => {
        const key = storage.key(index) ?? '';
        return `${key}=${storage.getItem(key) ?? ''}`;
      }),
    )
    .join('\n');

describe('signing in, which leaves the session to the httpOnly cookie the API sets', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("keeps no auth token in the browser's storage or readable cookies, though the sign-in and session answers carry one", async () => {
    window.sessionStorage.setItem('written-before-sign-in', 'kept');
    const authApi = anAuthApiWhoseAnswersCarryTheToken();
    const auth = await mountAuth();

    await act(async () => {
      await auth().login(PERSON.email, 'a-long-password-1');
    });

    expect(authApi).toHaveBeenCalled();
    expect(auth().user?.id).toBe(PERSON.id);
    expect(everythingInWebStorage()).toContain('written-before-sign-in=kept');
    expect(everythingInWebStorage()).not.toContain(SESSION_TOKEN);
    expect(document.cookie).not.toContain(SESSION_TOKEN);
  });
});
