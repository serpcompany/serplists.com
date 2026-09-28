import React, { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RouteObject } from 'react-router-dom';
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
} from 'react-router-dom/server';

// Renders routes under a data router, as the app does (RouterProvider), so hooks that
// need one (useBlocker) work. The static router is the server-side data router.
export async function renderDataRoutes(
  routes: RouteObject[],
  location: string,
  wrap: (router: ReactNode) => ReactNode = (router) => router,
): Promise<string> {
  const { dataRoutes, query } = createStaticHandler(routes);
  const context = await query(new Request(new URL(location, 'http://localhost')));
  if (context instanceof Response) {
    throw new Error(`Route ${location} answered with a redirect or response`);
  }

  const router = createStaticRouter(dataRoutes, context);
  return renderToStaticMarkup(
    wrap(<StaticRouterProvider context={context} hydrate={false} router={router} />),
  );
}
