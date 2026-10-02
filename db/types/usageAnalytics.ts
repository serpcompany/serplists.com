import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { usageAnalytics } from "../schema/usageAnalytics";

export type UsageAnalytics = InferSelectModel<typeof usageAnalytics>;
export type NewUsageAnalytics = InferInsertModel<typeof usageAnalytics>;
