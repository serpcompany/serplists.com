import { Outlet, useRouteError } from 'react-router-dom';

import { DevLoginBar } from '@/components/DevLoginBar';
import { Toaster } from '@/components/ui/sonner';

// The root route's element: these need the router (DevLoginBar navigates).
export const AppShell = () => (
  <>
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
