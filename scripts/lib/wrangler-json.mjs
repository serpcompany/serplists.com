import { z } from "zod";

const wranglerResultSetsSchema = z.array(z.object({ results: z.array(z.record(z.unknown())).optional() }));

export function parseWranglerResultSets(output) {
  return wranglerResultSetsSchema.parse(JSON.parse(output));
}
