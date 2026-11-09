import { navigation } from '../../support/mockedNextNavigation';
import '../../support/mockedConsoleContext';
import React, { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RouteErrorFallback } from '@/components/RouteErrorBoundary';

import { onTheInMemoryBrowser, renderSettled } from '../../support/renderInTheDom';

vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => ({ user: null }) }));

function BrokenPage(): never {
  throw new Error('render failed');
}

const press = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
    await navigation.settle();
  });

const visitTwoPagesThenCrash = async (boundary: React.ReactNode) => {
  navigation.reset('/templates/');
  navigation.router.push('/templates/broken/');
  await navigation.settle();
  return renderSettled(boundary);
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the app's last-resort error page", () => {
  it('reloads the page from Refresh Page', async () => {
    await onTheInMemoryBrowser(async () => {
      await visitTwoPagesThenCrash(<ErrorBoundary><BrokenPage /></ErrorBoundary>);

      await press('Refresh Page');

      expect(navigation.documentLoads).toContainEqual({ kind: 'reload', href: 'http://localhost/templates/broken/' });
    });
  });

  it('goes back a page from Go back', async () => {
    await onTheInMemoryBrowser(async () => {
      await visitTwoPagesThenCrash(<ErrorBoundary><BrokenPage /></ErrorBoundary>);

      await press('Go back');

      expect(navigation.pathname()).toBe('/templates/');
    });
  });

  it('shows the error and its stack while developing', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    await onTheInMemoryBrowser(async () => {
      await visitTwoPagesThenCrash(<ErrorBoundary><BrokenPage /></ErrorBoundary>);

      expect(screen.getByText('Error Details')).toBeTruthy();
      expect(screen.getByText(/render failed/)).toBeTruthy();
    });
  });

  it('shows the fallback it was given instead of its own page', async () => {
    await onTheInMemoryBrowser(async () => {
      await visitTwoPagesThenCrash(<ErrorBoundary fallback={<p>Editor unavailable</p>}><BrokenPage /></ErrorBoundary>);

      expect(screen.getByText('Editor unavailable')).toBeTruthy();
      expect(screen.queryByText('Something went wrong')).toBeNull();
    });
  });
});

describe("a route's error page", () => {
  it('clears the error and goes back a page from Go back', async () => {
    const reset = vi.fn();
    await onTheInMemoryBrowser(async () => {
      await visitTwoPagesThenCrash(<RouteErrorFallback reset={reset} />);

      await press('Go back');

      expect(reset).toHaveBeenCalledTimes(1);
      expect(navigation.pathname()).toBe('/templates/');
    });
  });
});
