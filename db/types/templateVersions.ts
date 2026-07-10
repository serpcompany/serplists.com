import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { template_versions } from "../schema/templateVersions";

export type TemplateVersion = InferSelectModel<typeof template_versions>;
export type NewTemplateVersion = InferInsertModel<typeof template_versions>;
