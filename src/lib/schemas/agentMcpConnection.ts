import { z } from 'zod';

// GET /api/agent-keys/connection: the MCP endpoint agents should use from this deployment.
// The server derives it from the same allowlist its MCP host check uses, so the Agent
// Access page never shows an endpoint that answers 403 "Invalid Host".
export const agentMcpConnectionSchema = z.object({
  // Null when this deployment has no host that the MCP host check accepts.
  mcpEndpoint: z.string().url().nullable(),
  // True when the page's API host is not accepted for MCP (for example a per-deployment
  // pages.dev URL), so mcpEndpoint, if any, is on the configured canonical host.
  hostMismatch: z.boolean(),
});

export type AgentMcpConnection = z.infer<typeof agentMcpConnectionSchema>;
