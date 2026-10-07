'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';

import { DevLoginBar } from '@/components/DevLoginBar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthProvider';
import { TemplatesProvider } from '@/contexts/TemplatesProvider';
import { WorkspaceProvider } from '@/contexts/WorkspaceProvider';
import { refreshBillingStatusOnCheckoutConflict } from '@/lib/access-flow';
import { createQueryClient } from '@/lib/queryClient';
import { applyStoredTheme, subscribeToThemeChanges } from '@/lib/theme';

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
