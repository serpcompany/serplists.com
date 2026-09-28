import { Outlet, useRouteError } from 'react-router-dom';

import { DevLoginBar } from '@/components/DevLoginBar';
import { ScrollToTop } from '@/components/routing/ScrollToTop';
import { Toaster } from '@/components/ui/sonner';

// The root route's element: these need the router (DevLoginBar navigates, ScrollToTop
// reads the location). ScrollToTop comes before the pages so it runs once per navigation.
export const AppShell = () => (
  <>
    <ScrollToTop />
    <Outlet />
    <DevLoginBar />
    <Toaster />
  </>
);

// The root route's errorElement: hands render errors to the app's ErrorBoundary
// instead of the router's default error page.
export const RethrowRouteError = (): never => {
  throw useRouteError();
};
