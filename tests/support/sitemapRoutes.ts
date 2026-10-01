import { serverContext } from './nextServerContext';

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
