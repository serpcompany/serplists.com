'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { resolveProtectedRouteAction } from '@/contexts/authSession';
import { withReturnPath } from '@/lib/auth/returnPath';
import { APP_BRAND_NAME } from '@/lib/brand';
import { buildLoginPath } from '@/lib/routes';

const RequireAuth = ({ children }: { children: ReactNode }) => {
  const { retrySession, sessionStatus } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const action = resolveProtectedRouteAction(sessionStatus);

  useEffect(() => {
    if (action !== 'redirect') {
      return;
    }

    const { search, hash } = window.location;
    const thisPage = `${pathname}${search}${hash}`;
    router.replace(withReturnPath(buildLoginPath(), thisPage));
  }, [action, pathname, router]);

  if (action === 'unavailable') {
    return (
      <div
        className="flex h-screen flex-col items-center justify-center gap-4 px-4 text-center"
        data-session-unavailable="true"
      >
        <h1 className="text-xl font-semibold text-foreground">Can&apos;t reach {APP_BRAND_NAME}</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          We couldn&apos;t check your session. Check your connection and try again.
        </p>
        <Button type="button" onClick={retrySession}>
          Retry
        </Button>
      </div>
    );
  }

  if (action !== 'render') {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
};

export default RequireAuth;
