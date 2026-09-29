'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';

import { DevLoginBar } from '@/components/DevLoginBar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { DocumentHeadProvider } from '@/components/shared/DocumentHeadProvider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/CloudflareAuthContext';
import { TemplatesProvider } from '@/contexts/TemplatesContext';
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';
import { refreshBillingStatusOnCheckoutConflict } from '@/lib/access-flow';
import { applyStoredTheme, subscribeToThemeChanges } from '@/lib/theme';

// One QueryClient per browser tab. It is created in state, not at module level: the server
// renders client components too, and a module-level client would share one visitor's cached
// data with the next.
const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        retry: 1,
      },
    },
  });

// Applies the stored theme, and a theme chosen in another tab, on every page, including those
// with no theme toggle.
const RootThemeSync = () => {
  useEffect(() => {
    applyStoredTheme();
    return subscribeToThemeChanges(() => undefined);
  }, []);

  return null;
};

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  // A checkout started from any page can find a plan the cached billing status lacks.
  useEffect(() => refreshBillingStatusOnCheckoutConflict(queryClient), [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <DocumentHeadProvider>
        <ErrorBoundary resetOnHistoryChange>
          <TooltipProvider>
            <AuthProvider>
              <WorkspaceProvider>
                <TemplatesProvider>
                  <RootThemeSync />
                  {/* Before the pages: it starts listening in an effect and drops toasts sent
                      earlier, and a page can toast from its first effect (Login after the
                      verification link). */}
                  <Toaster />
                  {children}
                  <DevLoginBar />
                </TemplatesProvider>
              </WorkspaceProvider>
            </AuthProvider>
          </TooltipProvider>
        </ErrorBoundary>
      </DocumentHeadProvider>
    </QueryClientProvider>
  );
}
