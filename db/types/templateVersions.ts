import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { templateVersions } from "../schema/templateVersions";

export type TemplateVersion = InferSelectModel<typeof templateVersions>;
export type NewTemplateVersion = InferInsertModel<typeof templateVersions>;
