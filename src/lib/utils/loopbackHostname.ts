// Loopback hostnames, where local-only features (Agent Access and the MCP endpoint)
// default on. Shared by the React app and the Pages Functions API. URL.hostname and
// location.hostname keep IPv6 brackets ("[::1]"), so one surrounding pair is stripped
// before matching. Matching is exact: "localhost.example.com" is not loopback.
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  const unbracketed = normalized.startsWith("[") && normalized.endsWith("]") ? normalized.slice(1, -1) : normalized;
  return LOOPBACK_HOSTNAMES.has(unbracketed);
}
