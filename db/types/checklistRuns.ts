import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { checklistRuns } from "../schema/checklistRuns";

export type ChecklistRun = InferSelectModel<typeof checklistRuns>;
export type NewChecklistRun = InferInsertModel<typeof checklistRuns>;
