import { z } from 'zod';

export const agentMcpConnectionSchema = z.object({
  mcpEndpoint: z.string().url().nullable(),
  hostMismatch: z.boolean(),
});

export type AgentMcpConnection = z.infer<typeof agentMcpConnectionSchema>;
