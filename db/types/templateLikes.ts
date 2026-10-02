import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { templateLikes } from "../schema/templateLikes";

export type TemplateLike = InferSelectModel<typeof templateLikes>;
export type NewTemplateLike = InferInsertModel<typeof templateLikes>;
