import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { templates } from "../schema/templates";

export type Template = InferSelectModel<typeof templates>;
export type NewTemplate = InferInsertModel<typeof templates>;
