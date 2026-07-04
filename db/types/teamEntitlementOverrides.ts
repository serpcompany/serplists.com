import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { team_entitlement_overrides } from "../schema/teamEntitlementOverrides";

export type TeamEntitlementOverride = InferSelectModel<typeof team_entitlement_overrides>;
export type NewTeamEntitlementOverride = InferInsertModel<typeof team_entitlement_overrides>;
