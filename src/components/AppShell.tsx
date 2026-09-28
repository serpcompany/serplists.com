import { Outlet, useRouteError } from 'react-router-dom';

import { DevLoginBar } from '@/components/DevLoginBar';
import { ScrollToTop } from '@/components/routing/ScrollToTop';
import { Toaster } from '@/components/ui/sonner';

// The root route's element: these need the router (DevLoginBar navigates, ScrollToTop
// reads the location). ScrollToTop comes before the pages so it runs once per navigation.
// The Toaster comes before them too: it starts listening in an effect and drops toasts sent
// earlier, and sibling effects run in order, so a page toasting from its first effect (Login
// after the verification link) is only shown if the Toaster's effect has already run.
export const AppShell = () => (
  <>
    <ScrollToTop />
    <Toaster />
    <Outlet />
    <DevLoginBar />
  </>
);

// The root route's errorElement: hands render errors to the app's ErrorBoundary
// instead of the router's default error page.
export const RethrowRouteError = (): never => {
  throw useRouteError();
};
