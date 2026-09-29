import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Only GET /api/auth/get-session extends a session, so a signed-in tab left open must keep
// asking the keep-alive (sessionSync.ts). AuthProvider starts it once signed in and stops it
// on sign-out; without that wiring the session expires while the user is still active.

const { getSession, keepAlive, signOut, startSessionKeepAlive, stopKeepAlive } = vi.hoisted(() => ({
  getSession: vi.fn(),
  keepAlive: vi.fn(),
  signOut: vi.fn(),
  startSessionKeepAlive: vi.fn(),
  stopKeepAlive: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
    getSession,
    signOut,
  },
}));

// The real session sync, without the browser listeners (there is no DOM here), with its
// keepAlive replaced by a spy and the keep-alive starter observed.
vi.mock('@/contexts/sessionSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/sessionSync')>();
  return {
    ...actual,
    createSessionSync: (...args: Parameters<typeof actual.createSessionSync>) => ({
      ...actual.createSessionSync(...args),
      keepAlive,
    }),
    browserSessionSyncEnvironment: () => ({
      openChannel: () => null,
      writeStorage: () => {},
      onStorage: () => () => {},
      onVisible: () => () => {},
      onRestored: () => () => {},
      onUnauthorized: () => () => {},
    }),
    startSessionKeepAlive,
  };
});

import { AuthProvider, useAuth } from '@/contexts/CloudflareAuthContext';

// Vitest runs in node with no DOM. The probe renders nothing, so React DOM needs only a
// container object, and a window while it commits, to run effects.
const fakeDocument = { nodeType: 9, activeElement: null, addEventListener() {}, removeEventListener() {} };
const fakeContainer = {
  nodeType: 1,
  nodeName: 'DIV',
  tagName: 'DIV',
  namespaceURI: 'http://www.w3.org/1999/xhtml',
  ownerDocument: fakeDocument,
  addEventListener() {},
  removeEventListener() {},
};
const globals = globalThis as Record<string, unknown>;
const savedGlobals = { window: globals.window, act: globals.IS_REACT_ACT_ENVIRONMENT };

beforeAll(() => {
  globals.window = { HTMLIFrameElement: class {}, document: fakeDocument, addEventListener() {}, removeEventListener() {} };
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  globals.window = savedGlobals.window;
  globals.IS_REACT_ACT_ENVIRONMENT = savedGlobals.act;
});

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.clearAllMocks();
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function mountAuth() {
  let auth: ReturnType<typeof useAuth> | undefined;
  function Probe() {
    auth = useAuth();
    return null;
  }
  root = createRoot(fakeContainer as unknown as Element);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await flush();
  });
  return () => {
    if (!auth) throw new Error('AuthProvider did not render');
    return auth;
  };
}

describe('AuthProvider session keep-alive', () => {
  it('starts the keep-alive once signed in and stops it on sign-out', async () => {
    startSessionKeepAlive.mockReturnValue(stopKeepAlive);
    getSession.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'person@example.com', username: 'person' }, session: {} },
      error: null,
    });
    signOut.mockResolvedValue({ data: { success: true }, error: null });

    const auth = await mountAuth();
    expect(auth().isAuthenticated).toBe(true);
    expect(startSessionKeepAlive).toHaveBeenCalledTimes(1);
    // It is started with the session sync's own keepAlive, which reads the session.
    expect(startSessionKeepAlive).toHaveBeenCalledWith(keepAlive);
    const [startedWith] = startSessionKeepAlive.mock.calls[0] as [() => unknown];
    startedWith();
    expect(keepAlive).toHaveBeenCalledTimes(1);
    expect(stopKeepAlive).not.toHaveBeenCalled();

    await act(async () => {
      await auth().logout();
    });

    expect(auth().isAuthenticated).toBe(false);
    expect(stopKeepAlive).toHaveBeenCalledTimes(1);
    expect(startSessionKeepAlive).toHaveBeenCalledTimes(1);
  });

  it('never starts it for a signed-out visitor', async () => {
    getSession.mockResolvedValue({ data: null, error: null });

    const auth = await mountAuth();

    expect(auth().sessionStatus).toBe('unauthenticated');
    expect(startSessionKeepAlive).not.toHaveBeenCalled();
  });
});
