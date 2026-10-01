'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';

import { DevLoginBar } from '@/components/DevLoginBar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/CloudflareAuthContext';
import { TemplatesProvider } from '@/contexts/TemplatesContext';
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';
import { refreshBillingStatusOnCheckoutConflict } from '@/lib/access-flow';
import { applyStoredTheme, subscribeToThemeChanges } from '@/lib/theme';

export const APP_QUERY_STALE_TIME_MS = 60 * 1000;

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: APP_QUERY_STALE_TIME_MS,
        retry: 1,
      },
    },
  });

const RootThemeSync = () => {
  useEffect(() => {
    applyStoredTheme();
    return subscribeToThemeChanges(() => undefined);
  }, []);

  return null;
};

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  useEffect(() => refreshBillingStatusOnCheckoutConflict(queryClient), [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary resetOnHistoryChange>
        <TooltipProvider>
          <AuthProvider>
            <WorkspaceProvider>
              <TemplatesProvider>
                <RootThemeSync />
                <Toaster />
                {children}
                <DevLoginBar />
              </TemplatesProvider>
            </WorkspaceProvider>
          </AuthProvider>
        </TooltipProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
