import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { usage_analytics } from "../schema/usageAnalytics";

export type UsageAnalytics = InferSelectModel<typeof usage_analytics>;
export type NewUsageAnalytics = InferInsertModel<typeof usage_analytics>;
