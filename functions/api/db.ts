import { drizzle } from "drizzle-orm/d1";
import type { Env } from "./types";
import * as schema from "../../db/schema/index";
import { withD1Profiling } from "./utils/d1-profiler";
import { log } from "./utils/logger";

const binding = (env: Env) =>
  env.D1_PROFILE === "true" ? withD1Profiling(env.DB, (record) => log("info", "d1_query", record)) : env.DB;

export const createDb = (env: Env) => drizzle(binding(env), { schema });
export { schema };
