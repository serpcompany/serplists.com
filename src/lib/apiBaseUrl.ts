/** The local API that `pnpm run dev` talks to when VITE_API_URL is not set. */
const LOCAL_DEV_API_BASE_URL = 'http://localhost:8788/api';

const LOOPBACK_HOSTNAMES = new Set(['localhost', '::1', '[::1]', '0.0.0.0']);

/** localhost, *.localhost, 127.0.0.0/8, ::1, and 0.0.0.0. */
export const isLoopbackHostname = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return (
    LOOPBACK_HOSTNAMES.has(host) ||
    host.endsWith('.localhost') ||
    /^127(?:\.\d{1,3}){3}$/.test(host)
  );
};

export const isLoopbackUrl = (value: string): boolean => {
  try {
    return isLoopbackHostname(new URL(value).hostname);
  } catch {
    return false;
  }
};

/**
 * The API base URL for this bundle. Deployed bundles use the same-origin `/api`
 * unless VITE_API_URL names another API. A loopback VITE_API_URL is honored only
 * when the page itself is served from a loopback host, so a bundle built on a
 * developer machine never sends a deployed site's traffic to the visitor's own
 * localhost.
 */
export const resolveApiBaseUrl = ({
  isDev,
  configuredUrl,
  pageHostname,
}: {
  isDev: boolean;
  configuredUrl: string | undefined;
  pageHostname: string | undefined;
}): string => {
  if (isDev) return configuredUrl ?? LOCAL_DEV_API_BASE_URL;
  if (!configuredUrl) return '/api';
  if (isLoopbackUrl(configuredUrl) && !(pageHostname && isLoopbackHostname(pageHostname))) {
    return '/api';
  }
  return configuredUrl;
};

/** The origin Better Auth talks to: the API's own origin, or the page's for `/api`. */
export const resolveApiServerOrigin = (apiBaseUrl: string, getPageOrigin: () => string): string =>
  /^https?:\/\//i.test(apiBaseUrl) ? new URL(apiBaseUrl).origin : getPageOrigin();
