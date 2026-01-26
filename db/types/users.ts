import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { users } from "../schema/users";

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
