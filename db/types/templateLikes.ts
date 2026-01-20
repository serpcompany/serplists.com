import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { template_likes } from "../schema/templateLikes";

export type TemplateLike = InferSelectModel<typeof template_likes>;
export type NewTemplateLike = InferInsertModel<typeof template_likes>;
