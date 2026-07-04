import { afterEach, describe, expect, it, vi } from 'vitest';

import { redirectToLoginAfterUnauthorized } from '@/lib/api/client';

class TestPopStateEvent extends Event {
  state: unknown;

  constructor(type: string, init?: { state?: unknown }) {
    super(type);
    this.state = init?.state;
  }
}

function stubBrowserLocation(pathname: string) {
  const location = { pathname };
  const history = {
    state: { current: pathname },
    pushState: vi.fn((state: unknown, _title: string, url?: string | URL | null) => {
      history.state = state;
      if (url) {
        location.pathname = new URL(String(url), 'http://localhost').pathname;
      }
    }),
  };
  const dispatchEvent = vi.fn();

  vi.stubGlobal('PopStateEvent', TestPopStateEvent);
  vi.stubGlobal('window', {
    dispatchEvent,
    history,
    location,
  });

  return { dispatchEvent, history, location };
}

describe('redirectToLoginAfterUnauthorized', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('updates the URL and dispatches popstate for SPA routers', () => {
    const browser = stubBrowserLocation('/dashboard/settings');

    redirectToLoginAfterUnauthorized();

    expect(browser.history.pushState).toHaveBeenCalledWith(
      { authRedirect: true },
      '',
      '/login',
    );
    expect(browser.location.pathname).toBe('/login');
    expect(browser.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'popstate' }),
    );
  });

  it('dispatches popstate without adding another entry when already on login', () => {
    const browser = stubBrowserLocation('/login');

    redirectToLoginAfterUnauthorized();

    expect(browser.history.pushState).not.toHaveBeenCalled();
    expect(browser.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'popstate' }),
    );
  });
});
