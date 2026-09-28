import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { buildConsoleTemplatesPath } from '@/lib/routes';

// Wraps one page, below the Router and the site header. A page that crashes shows this card in
// its place while the header and navigation keep working, and going to another path clears it.
// The reset key is the pathname, so pages that did not crash are never remounted.
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  return (
    <ErrorBoundary resetKey={pathname} fallback={({ reset }) => <RouteErrorFallback reset={reset} />}>
      {children}
    </ErrorBoundary>
  );
}

export function RouteErrorFallback({ reset }: { reset: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const home = user
    ? { to: buildConsoleTemplatesPath(), label: 'Go to My Templates' }
    : { to: '/', label: 'Go to home' };

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          This page could not be shown. Try again, or go to another page.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
        <Button variant="outline" onClick={() => navigate(-1)}>
          Go back
        </Button>
        <Button asChild>
          <Link to={home.to}>{home.label}</Link>
        </Button>
      </div>
    </div>
  );
}
