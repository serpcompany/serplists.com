import { isLoopbackHostname } from './utils/loopbackHostname';

const ALL_INTERFACES = '0.0.0.0';

export const isLocalDevelopmentHostname = (hostname: string): boolean =>
  isLoopbackHostname(hostname) || hostname === ALL_INTERFACES;

export const isLocalDevelopmentUrl = (value: string): boolean => {
  try {
    return isLocalDevelopmentHostname(new URL(value).hostname);
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
  if (isLocalDevelopmentUrl(configuredUrl) && !(pageHostname && isLocalDevelopmentHostname(pageHostname))) {
    return '/api';
  }
  return configuredUrl;
};

export const resolveApiServerOrigin = (apiBaseUrl: string, getPageOrigin: () => string): string =>
  /^https?:\/\//i.test(apiBaseUrl) ? new URL(apiBaseUrl).origin : getPageOrigin();
