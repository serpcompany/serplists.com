import { z } from "zod";

const optionalText = z.string().nullish();

const historyActorSchema = z.object({
  userId: z.string().nullable(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  username: z.string().nullable(),
});

const historySubjectSchema = z.object({ type: z.enum(["user", "team"]), id: z.string() });

const historyEventSchema = z.object({
  id: z.string(),
  action: z.string(),
  createdAt: z.string(),
  requestId: optionalText,
  metadata: z.unknown(),
  actor: historyActorSchema,
});

const templateHistoryVersionSchema = z.object({
  id: z.string(),
  version: z.number(),
  action: z.string(),
  contentHash: optionalText,
  createdAt: z.string(),
  metadata: z.unknown(),
  actor: historyActorSchema,
});

export const templateHistorySchema = z.object({
  templateId: z.string(),
  subject: historySubjectSchema,
  versions: z.array(templateHistoryVersionSchema),
  events: z.array(historyEventSchema),
});

export const runHistorySchema = z.object({
  checklistId: z.string(),
  subject: historySubjectSchema,
  events: z.array(historyEventSchema),
});

export const teamActivityEventSchema = historyEventSchema.extend({
  resource: z.object({ type: z.string(), id: z.string() }),
});

export type HistoryEvent = z.infer<typeof historyEventSchema>;
export type TemplateHistoryVersion = z.infer<typeof templateHistoryVersionSchema>;
export type TemplateHistoryResponse = z.infer<typeof templateHistorySchema>;
export type RunHistoryResponse = z.infer<typeof runHistorySchema>;
export type TeamActivityEvent = z.infer<typeof teamActivityEventSchema>;
