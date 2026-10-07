import { z } from "zod";

const wranglerResultSetsSchema = z.array(z.object({ results: z.array(z.record(z.unknown())).optional() }));

export type WranglerResultSets = z.infer<typeof wranglerResultSetsSchema>;

export function parseWranglerResultSets(output: string): WranglerResultSets {
  return wranglerResultSetsSchema.parse(JSON.parse(output));
}
