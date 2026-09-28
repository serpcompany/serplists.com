import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RouteErrorFallback } from '@/components/RouteErrorBoundary';

let authUser: { id: string } | null = null;

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: authUser }),
}));

type Props = React.ComponentProps<typeof ErrorBoundary>;

// Drives the class the way React does: a render error sets state through
// getDerivedStateFromError, and new props arrive before componentDidUpdate.
function mountBoundary(props: Props) {
  const boundary = new ErrorBoundary(props);
  boundary.setState = ((update: Partial<typeof boundary.state>) => {
    const previous = boundary.state;
    boundary.state = { ...boundary.state, ...update };
    boundary.componentDidUpdate(boundary.props, previous);
  }) as typeof boundary.setState;
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
    html: () => renderToStaticMarkup(<>{boundary.render()}</>),
  };
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    authUser = null;
  });

  it('clears the error when its reset key changes, so navigating away recovers', () => {
    const page = mountBoundary({ children: <p>Page</p>, resetKey: '/categories/broken' });
    page.crash();
    expect(page.boundary.state.hasError).toBe(true);

    page.update({ children: <p>Page</p>, resetKey: '/categories/broken' });
    expect(page.boundary.state.hasError).toBe(true);

    page.update({ children: <p>Page</p>, resetKey: '/templates' });
    expect(page.boundary.state.hasError).toBe(false);
    expect(page.html()).toBe('<p>Page</p>');
  });

  it('leaves a healthy page alone when the key changes', () => {
    const page = mountBoundary({ children: <p>Page</p>, resetKey: '/a' });
    const setState = vi.spyOn(page.boundary, 'setState');

    page.update({ children: <p>Page</p>, resetKey: '/b' });

    expect(setState).not.toHaveBeenCalled();
  });

  it('recovers the whole app on browser Back when asked to, and stops listening afterwards', () => {
    const history = new EventTarget();
    vi.stubGlobal('window', history);
    const app = mountBoundary({ children: <p>App</p>, resetOnHistoryChange: true });

    app.crash();
    history.dispatchEvent(new Event('popstate'));
    expect(app.boundary.state.hasError).toBe(false);

    app.crash();
    app.boundary.componentWillUnmount();
    history.dispatchEvent(new Event('popstate'));
    expect(app.boundary.state.hasError).toBe(true);
  });

  it('offers a plain link home in the last-resort fallback, which renders outside any Router', () => {
    const app = mountBoundary({ children: <p>App</p> });
    app.crash();

    const html = app.html();

    expect(html).toContain('Something went wrong');
    expect(html).toContain('href="/"');
    expect(html).toContain('Go to home');
    expect(html).toContain('Go back');
  });

  it('passes reset to a fallback render function', () => {
    const fallback = vi.fn(({ reset }: { reset: () => void }) => <button onClick={reset}>Retry</button>);
    const page = mountBoundary({ children: <p>Page</p>, fallback });
    page.crash();

    expect(page.html()).toContain('Retry');
    fallback.mock.calls[0][0].reset();
    expect(page.boundary.state.hasError).toBe(false);
  });
});

describe('RouteErrorFallback', () => {
  const renderFallback = () =>
    renderToStaticMarkup(
      <StaticRouter location="/categories/broken">
        <RouteErrorFallback reset={() => {}} />
      </StaticRouter>,
    );

  it('keeps the visitor moving: try again, go back, or go home', () => {
    const html = renderFallback();

    expect(html).toContain('Try again');
    expect(html).toContain('Go back');
    expect(html).toContain('href="/"');
  });

  it('sends a signed-in user to My Templates', () => {
    authUser = { id: 'user-1' };

    expect(renderFallback()).toContain('href="/dashboard/templates"');
  });
});
