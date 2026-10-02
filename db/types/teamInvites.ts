import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { teamInvites } from "../schema/teamInvites";

export type TeamInvite = InferSelectModel<typeof teamInvites>;
export type NewTeamInvite = InferInsertModel<typeof teamInvites>;
