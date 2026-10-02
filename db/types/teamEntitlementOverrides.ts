import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { teamEntitlementOverrides } from "../schema/teamEntitlementOverrides";

export type TeamEntitlementOverride = InferSelectModel<typeof teamEntitlementOverrides>;
export type NewTeamEntitlementOverride = InferInsertModel<typeof teamEntitlementOverrides>;
