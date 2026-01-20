import { drizzle } from "drizzle-orm/d1";
import type { Env } from "./types";
import * as schema from "../../db/schema/index";

export const createDb = (env: Env) => drizzle(env.DB, { schema });
export { schema };
