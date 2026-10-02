import { z } from "zod";

const batchResultSchema = z.object({ meta: z.object({ changes: z.number() }) });

export function batchChanges(result: unknown): number | null {
  const parsed = batchResultSchema.safeParse(result);
  return parsed.success ? parsed.data.meta.changes : null;
}

export function batchWriteMissed(result: unknown): boolean {
  return batchChanges(result) === 0;
}
