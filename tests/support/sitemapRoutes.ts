import { vi } from 'vitest';

import { serverContext } from './nextServerContext';

vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', async () => (await import('./nextServerContext')).cloudflareMock);
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  ...(await import('./nextServerContext')).requestScopeMock,
}));

type SitemapRouteGet = (request: Request, context: { params: Promise<{ page: string }> }) => Response | Promise<Response>;

type WorkerRequest = {
  request: Request;
  env: unknown;
  waitUntil?: (promise: Promise<unknown>) => void;
  params?: { page?: string };
};

export const sitemapRouteInTheWorker = (GET: SitemapRouteGet) => async ({ request, env, waitUntil, params }: WorkerRequest) => {
  serverContext.env = env as Record<string, unknown>;
  serverContext.waitUntil = [];
  const pageFileNameAsNextJsPassesIt = `${params?.page ?? ''}.xml`;
  const response = await GET(request, { params: Promise.resolve({ page: pageFileNameAsNextJsPassesIt }) });
  serverContext.waitUntil.forEach((promise) => waitUntil?.(promise));
  return response;
};
