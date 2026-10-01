const CANONICAL_LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const IPV4_LOOPBACK = /^127(?:\.\d{1,3}){3}$/;

const withoutIpv6Brackets = (hostname: string): string =>
  hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

const normalizedHostname = (hostname: string): string => withoutIpv6Brackets(hostname.toLowerCase());

export function isLoopbackHostname(hostname: string): boolean {
  const host = normalizedHostname(hostname).replace(/\.$/, "");
  return host === "localhost" || host.endsWith(".localhost") || host === "::1" || IPV4_LOOPBACK.test(host);
}

export function isCanonicalLoopbackHostname(hostname: string): boolean {
  return CANONICAL_LOOPBACK_HOSTNAMES.has(normalizedHostname(hostname));
}
