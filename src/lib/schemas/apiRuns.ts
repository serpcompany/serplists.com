import { z } from "zod";

import { readableRowsOf } from "./apiResponses";

const text = z.string().nullish();

const runActorSchema = z.object({ userId: z.string(), name: z.string().nullable(), username: z.string().nullable() }).nullable();

const runProvenanceSchema = z.object({
  origin: z.enum(['web', 'mcp', 'unknown']).catch('unknown'),
  startedBy: runActorSchema,
  owner: z.object({ type: z.enum(['personal', 'organization']), id: z.string(), name: z.string().nullable() }).optional(),
  template: z.object({ id: z.string().nullable(), title: z.string().nullable(), version: z.number() }).optional(),
  agentKeyName: z.string().nullable().optional(),
  authorizedBy: runActorSchema.optional(),
  createdBy: runActorSchema.optional(),
  assignedTo: runActorSchema.optional(),
  completedBy: runActorSchema.optional(),
});

export const apiRunSchema = z.object({
  id: z.string(),
  template_id: text,
  title: text,
  status: text,
  items: z.unknown(),
  sections: z.unknown(),
  retired_items: z.unknown(),
  progress: z.number().nullish(),
  started_at: text,
  created_at: text,
  updated_at: text,
  completed_at: text,
  deleted_at: text,
  user_id: text,
  team_id: text,
  template_version: z.number().nullish(),
  current_template_version: z.number().nullish(),
  revision: z.number().nullish(),
  is_stale: z.boolean().nullish(),
  is_public: z.union([z.boolean(), z.number()]).nullish(),
  provenance: runProvenanceSchema.nullish().catch(null),
});

export const apiRunListSchema = readableRowsOf(apiRunSchema);

export const createdRunSchema = z.object({ id: z.string() });

export const runShareCreatedSchema = z.object({ id: z.string(), shareToken: z.string(), sharePath: z.string() });

export const runShareRevokedSchema = z.object({ id: z.string(), isPublic: z.literal(false) });

export const runSavedSchema = z.object({ success: z.literal(true), revision: z.number() });

export const sharedRunSavedSchema = runSavedSchema.extend({ progress: z.number() });

export const runRevalidatedSchema = runSavedSchema.extend({ progress: z.number(), template_version: z.number() });

export type ApiRun = z.infer<typeof apiRunSchema>;
