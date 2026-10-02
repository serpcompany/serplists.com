import { navigation } from '../../support/mockedNextNavigation';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { usePathname } from 'next/navigation';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { firstOf } from '../../support/elements';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RouteErrorFallback } from '@/components/RouteErrorBoundary';
import { click, createFakeContainer, elementOf, findByText, installFakeDomGlobals } from '../../fixtures/fakeDom';

let authUser: { id: string } | null = null;

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: authUser }),
}));

type Props = React.ComponentProps<typeof ErrorBoundary>;

function mountBoundaryDrivenLikeReact(props: Props) {
  const boundary = new ErrorBoundary(props);
  boundary.setState = (update) => {
    const previous = boundary.state;
    const next = typeof update === 'function' ? update(previous, boundary.props) : update;
    boundary.state = { ...previous, ...next };
    boundary.componentDidUpdate(boundary.props, previous);
  };
  return {
    boundary,
    crash: () => {
      const previous = boundary.state;
      boundary.state = { ...boundary.state, ...ErrorBoundary.getDerivedStateFromError(new Error('render failed')) };
      boundary.componentDidUpdate(boundary.props, previous);
    },
    update: (next: Props) => {
      const previousProps = boundary.props;
      (boundary as { props: Props }).props = next;
      boundary.componentDidUpdate(previousProps, boundary.state);
    },
    updateAndCrash: (next: Props) => {
      const previousProps = boundary.props;
      const previousState = boundary.state;
      (boundary as { props: Props }).props = next;
      boundary.state = { ...boundary.state, ...ErrorBoundary.getDerivedStateFromError(new Error('render failed')) };
      boundary.componentDidUpdate(previousProps, previousState);
    },
    html: () => renderToStaticMarkup(<>{boundary.render()}</>),
  };
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    authUser = null;
  });

  it('clears the error when its reset key changes, so navigating away recovers', () => {
    const page = mountBoundaryDrivenLikeReact({ children: <p>Page</p>, resetKey: '/categories/broken' });
    page.crash();
    expect(page.boundary.state.hasError).toBe(true);

    page.update({ children: <p>Page</p>, resetKey: '/categories/broken' });
    expect(page.boundary.state.hasError).toBe(true);

    page.update({ children: <p>Page</p>, resetKey: '/templates' });
    expect(page.boundary.state.hasError).toBe(false);
    expect(page.html()).toBe('<p>Page</p>');
  });

  it('leaves a healthy page alone when the key changes', () => {
    const page = mountBoundaryDrivenLikeReact({ children: <p>Page</p>, resetKey: '/a' });
    const setState = vi.spyOn(page.boundary, 'setState');

    page.update({ children: <p>Page</p>, resetKey: '/b' });

    expect(setState).not.toHaveBeenCalled();
  });

  it('keeps the error of a page that crashes as it opens, since a new key clears only an error already showing', () => {
    const page = mountBoundaryDrivenLikeReact({ children: <p>Page</p>, resetKey: '/templates' });

    page.updateAndCrash({ children: <p>Page</p>, resetKey: '/categories/broken' });

    expect(page.boundary.state.hasError).toBe(true);
  });

  it('recovers the whole app on browser Back when asked to, and stops listening afterwards', () => {
    const history = new EventTarget();
    vi.stubGlobal('window', history);
    const app = mountBoundaryDrivenLikeReact({ children: <p>App</p>, resetOnHistoryChange: true });

    app.crash();
    history.dispatchEvent(new Event('popstate'));
    expect(app.boundary.state.hasError).toBe(false);

    app.crash();
    app.boundary.componentWillUnmount();
    history.dispatchEvent(new Event('popstate'));
    expect(app.boundary.state.hasError).toBe(true);
  });

  it('offers a link home in the last-resort fallback for a crashed provider or layout, which the Next.js router above it follows to mount the app again', async () => {
    const restoreGlobals = installFakeDomGlobals(navigation.window);
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    let shellBroken = true;
    function Shell() {
      const pathname = usePathname();
      if (shellBroken) throw new Error('provider failed');
      return <p>App at {pathname}</p>;
    }
    navigation.reset('/dashboard/templates/');
    const container = createFakeContainer();
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <ErrorBoundary>
            <Shell />
          </ErrorBoundary>,
        );
      });
      expect(container.textContent).toContain('Something went wrong');
      expect(container.textContent).toContain('Go back');
      expect(container.textContent).toContain('Refresh Page');
      const home = elementOf(findByText(container, 'A', 'Go to home'), 'the Go to home link');
      expect(home.getAttribute('href')).toBe('/');

      shellBroken = false;
      await act(async () => {
        click(container, home);
        await navigation.settle();
      });

      expect(navigation.pathname()).toBe('/');
      expect(container.textContent).toBe('App at /');
    } finally {
      act(() => root.unmount());
      silence.mockRestore();
      restoreGlobals();
    }
  });

  it('passes reset to a fallback render function', () => {
    const fallback = vi.fn(({ reset }: { reset: () => void }) => <button onClick={reset}>Retry</button>);
    const page = mountBoundaryDrivenLikeReact({ children: <p>Page</p>, fallback });
    page.crash();

    expect(page.html()).toContain('Retry');
    firstOf(fallback.mock.calls)[0].reset();
    expect(page.boundary.state.hasError).toBe(false);
  });
});

describe('RouteErrorFallback', () => {
  const renderFallback = () => {
    navigation.reset('/categories/broken/');
    return renderToStaticMarkup(
      <RouteErrorFallback reset={() => {}} />,
    );
  };

  it('keeps the visitor moving: try again, go back, or go home', () => {
    const html = renderFallback();

    expect(html).toContain('Try again');
    expect(html).toContain('Go back');
    expect(html).toContain('href="/"');
  });

  it('sends a signed-in user to My Templates', () => {
    authUser = { id: 'user-1' };

    expect(renderFallback()).toContain('href="/dashboard/templates/"');
  });
});
