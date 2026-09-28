import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { type ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DocumentHeadProvider } from '@/components/shared/DocumentHeadProvider';
import { AuthProvider } from './contexts/CloudflareAuthContext';
import { TemplatesProvider } from './contexts/TemplatesContext';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import { appRoutes } from './appRoutes';
import { applyStoredTheme, subscribeToThemeChanges } from './lib/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      retry: 1,
    },
  },
});

// Applies the stored theme, and a theme chosen in another tab, on every route, including
// those with no theme toggle.
const RootThemeSync = () => {
  useEffect(() => {
    applyStoredTheme();
    return subscribeToThemeChanges(() => undefined);
  }, []);

  return null;
};

type AppRouter = ReturnType<typeof createBrowserRouter>;

// A data router, not BrowserRouter: useBlocker (the template editor's unsaved-changes
// guard for links and browser Back) only works under one. Created once, on first render.
let browserRouter: AppRouter | undefined;
const getBrowserRouter = (): AppRouter => {
  browserRouter ??= createBrowserRouter(appRoutes, {
    // The app uses no loaders, actions, or fetchers, so the flags for those only
    // silence the v7 upgrade warnings.
    future: {
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_relativeSplatPath: true,
      v7_skipActionErrorRevalidation: true,
    },
  });
  return browserRouter;
};

// Everything around the router. Tests render the routes inside it with a static
// data router, since createBrowserRouter needs a browser.
export const AppProviders = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <DocumentHeadProvider>
      <ErrorBoundary resetOnHistoryChange>
        <TooltipProvider>
          <AuthProvider>
            <WorkspaceProvider>
              <TemplatesProvider>
                <RootThemeSync />
                {children}
              </TemplatesProvider>
            </WorkspaceProvider>
          </AuthProvider>
        </TooltipProvider>
      </ErrorBoundary>
    </DocumentHeadProvider>
  </QueryClientProvider>
);

const App = () => (
  <AppProviders>
    <RouterProvider router={getBrowserRouter()} />
  </AppProviders>
);

export default App;
