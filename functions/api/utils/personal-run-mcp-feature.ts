import type { Env } from "../types";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

export function isPersonalRunMcpPath(path: string): boolean {
  return path === "mcp" || path === "agent-keys" || path.startsWith("agent-keys/");
}

export function isPersonalRunMcpEnabled(env: Env, url: URL): boolean {
  if (env.PERSONAL_RUN_MCP_ENABLED === "true") return true;
  if (env.PERSONAL_RUN_MCP_ENABLED === "false") return false;
  return LOCAL_HOSTNAMES.has(url.hostname);
}
