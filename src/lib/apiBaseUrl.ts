const LOOPBACK_HOSTNAMES = new Set(['localhost', '::1', '[::1]', '0.0.0.0']);

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

export const resolveApiBaseUrl = ({
  configuredUrl,
  pageHostname,
}: {
  configuredUrl: string | undefined;
  pageHostname: string | undefined;
}): string => {
  if (!configuredUrl) return '/api';
  if (isLoopbackUrl(configuredUrl) && !(pageHostname && isLoopbackHostname(pageHostname))) {
    return '/api';
  }
  return configuredUrl;
};

export const resolveApiServerOrigin = (apiBaseUrl: string, getPageOrigin: () => string): string =>
  /^https?:\/\//i.test(apiBaseUrl) ? new URL(apiBaseUrl).origin : getPageOrigin();
