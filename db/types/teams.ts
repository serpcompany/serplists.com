import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { teams } from "../schema/teams";

export type Team = InferSelectModel<typeof teams>;
export type NewTeam = InferInsertModel<typeof teams>;
