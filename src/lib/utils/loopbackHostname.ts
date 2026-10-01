const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

const withoutIpv6Brackets = (hostname: string): string =>
  hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(withoutIpv6Brackets(hostname.toLowerCase()));
}
