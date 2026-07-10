import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { team_members } from "../schema/teamMembers";

export type TeamMember = InferSelectModel<typeof team_members>;
export type NewTeamMember = InferInsertModel<typeof team_members>;
