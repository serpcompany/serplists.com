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

const RequireAuth = ({ children }: { children: ReactNode }) => {
  const { retrySession, sessionStatus } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  // Only a confirmed "no session" goes to /login. A failed session check keeps the page and
  // offers a retry, because the user's session may still be valid.
  const action = resolveProtectedRouteAction(sessionStatus);

  useEffect(() => {
    if (action !== 'redirect') {
      return;
    }

    // Login sends the user back here after signing in (the `next` parameter, sanitized there).
    const { search, hash } = window.location;
    router.replace(withReturnPath('/login', `${pathname}${search}${hash}`));
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
