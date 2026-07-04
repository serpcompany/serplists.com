import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { team_invites } from "../schema/teamInvites";

export type TeamInvite = InferSelectModel<typeof team_invites>;
export type NewTeamInvite = InferInsertModel<typeof team_invites>;
