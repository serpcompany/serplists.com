import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { checklist_runs } from "../schema/checklistRuns";

export type ChecklistRun = InferSelectModel<typeof checklist_runs>;
export type NewChecklistRun = InferInsertModel<typeof checklist_runs>;
