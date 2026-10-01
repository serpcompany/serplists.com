import { z } from "zod";

import { runKeyPermissionSchema } from "./runKeyPermissions";

export const agentKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  permissions: z.array(runKeyPermissionSchema),
  status: z.enum(["active", "revoked"]),
});

export const createdAgentKeySchema = z.object({ key: agentKeySchema, secret: z.string() });

export const revokedAgentKeySchema = z.object({ id: z.string(), revokedAt: z.string() });

export const publicProfileSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  full_name: z.string().nullish(),
  avatar_url: z.string().nullish(),
  created_at: z.union([z.string(), z.number()]).nullish(),
});

export const uploadedFileSchema = z.object({
  url: z.string(),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
});

export const billingStatusSchema = z.object({
  plan: z.enum(["free", "pro", "team"]),
  limits: z.object({ maxTemplates: z.number().nullable(), maxActiveRuns: z.number().nullable() }).optional(),
  billingEnabled: z.boolean().optional(),
  subscriptionStatus: z.string().nullish(),
  canManageBilling: z.boolean().optional(),
  managedBySupport: z.boolean().optional(),
});

export type AgentKey = z.infer<typeof agentKeySchema>;
export type AgentKeyStatus = AgentKey["status"];
export type CreatedAgentKey = z.infer<typeof createdAgentKeySchema>;
export type PublicProfile = z.infer<typeof publicProfileSchema>;
export type BillingStatus = z.infer<typeof billingStatusSchema>;
