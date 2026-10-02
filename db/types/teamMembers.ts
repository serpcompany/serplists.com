import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { teamMembers } from "../schema/teamMembers";

export type TeamMember = InferSelectModel<typeof teamMembers>;
export type NewTeamMember = InferInsertModel<typeof teamMembers>;
