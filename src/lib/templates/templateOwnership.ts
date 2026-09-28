import type { ChecklistTemplate } from "@/types/checklist";

/**
 * True when `template` is one of `userId`'s Personal templates. Public catalog rows leave
 * out team_id (the API never names an Organization in public responses), so an
 * Organization template the user created is told apart by its owner type as well.
 */
export const isPersonalTemplateOf = (
  template: Pick<ChecklistTemplate, "userId" | "teamId" | "ownerType">,
  userId: string | null | undefined,
): boolean =>
  Boolean(userId) && template.userId === userId && !template.teamId && template.ownerType !== "team";
