import type { AgentMcpConnection } from "../../../src/lib/schemas/agentMcpConnection";
import { isLoopbackHostname } from "../../../src/lib/utils/loopbackHostname";
import type { Env } from "../types";
import { urlOrigin } from "./origin-list";

const MCP_PATH = "/api/mcp";

export function configuredOrigins(env: Env): Set<string> {
  const origins = new Set<string>();
  for (const value of [env.FRONTEND_URL, ...(env.CORS_ALLOWED_ORIGINS?.split(",") ?? [])]) {
    const origin = urlOrigin(value);
    if (origin) origins.add(origin);
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
