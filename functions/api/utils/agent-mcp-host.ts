import type { AgentMcpConnection } from "../../../src/lib/schemas/agentMcpConnection";
import { isLoopbackHostname } from "../../../src/lib/utils/loopbackHostname";
import type { Env } from "../types";

// The MCP endpoint's host and Origin checks, and the endpoint the Agent Access page shows.
// Both come from FRONTEND_URL and CORS_ALLOWED_ORIGINS, so the page can only advertise a
// host the MCP server accepts.

const MCP_PATH = "/api/mcp";

// FRONTEND_URL first, then CORS_ALLOWED_ORIGINS, in order. The first entry is the
// canonical origin.
export function configuredOrigins(env: Env): Set<string> {
  const origins = new Set<string>();
  for (const value of [env.FRONTEND_URL, ...(env.CORS_ALLOWED_ORIGINS?.split(",") ?? [])]) {
    if (!value?.trim()) continue;
    try {
      origins.add(new URL(value.trim()).origin);
    } catch {
      // Invalid configuration never broadens access.
    }
  }
  return origins;
}

export function requestOriginIsAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    const normalized = new URL(origin).origin;
    return normalized === new URL(request.url).origin || configuredOrigins(env).has(normalized);
  } catch {
    return false;
  }
}

// DNS-rebinding defense: accept only loopback hosts and hosts in the configured origins.
// Never widen this to a suffix such as *.pages.dev.
export function requestHostIsSafe(request: Request, env: Env): boolean {
  const host = request.headers.get("Host");
  const requestUrl = new URL(request.url);
  if (host && host.toLowerCase() !== requestUrl.host.toLowerCase()) return false;

  if (isLoopbackHostname(requestUrl.hostname)) return true;

  const allowedHosts = new Set(
    Array.from(configuredOrigins(env), (origin) => new URL(origin).host.toLowerCase()),
  );
  return allowedHosts.has(requestUrl.host.toLowerCase());
}

// The MCP endpoint to show for a request from the Agent Access page: the request's own
// origin when the MCP host check accepts it, otherwise the canonical configured origin
// (a per-deployment URL such as https://3f2a1b9c.<project>.pages.dev is never on the
// allowlist), or null when there is none.
export function resolveAgentMcpConnection(request: Request, env: Env): AgentMcpConnection {
  if (requestHostIsSafe(request, env)) {
    return { mcpEndpoint: new URL(MCP_PATH, request.url).toString(), hostMismatch: false };
  }
  const [canonicalOrigin] = configuredOrigins(env);
  return {
    mcpEndpoint: canonicalOrigin ? new URL(MCP_PATH, canonicalOrigin).toString() : null,
    hostMismatch: true,
  };
}
