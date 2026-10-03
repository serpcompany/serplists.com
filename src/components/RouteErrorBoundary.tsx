'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { buildConsoleTemplatesPath } from '@/lib/routes';

import { Link } from '@/components/navigation/Link';
import { useAppRouter } from '@/lib/navigation/useAppRouter';

export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <ErrorBoundary resetKey={pathname} fallback={({ reset }) => <RouteErrorFallback reset={reset} />}>
      {children}
    </ErrorBoundary>
  );
}

export function RouteErrorFallback({ reset }: { reset: () => void }) {
  const { user } = useAuth();
  const { consoleContext } = useWorkspace();
  const router = useAppRouter();
  const home = user
    ? { to: buildConsoleTemplatesPath(consoleContext), label: 'Go to My Templates' }
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
        <Button
          variant="outline"
          onClick={() => {
            reset();
            router.back();
          }}
        >
          Go back
        </Button>
        <Link href={home.to} onClick={reset} className={buttonVariants()}>
            {home.label}
          </Link>
      </div>
    </div>
  );
}
