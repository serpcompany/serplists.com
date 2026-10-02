import type { ChecklistTemplate } from "@/types/checklist";

export const isPersonalTemplateOf = (
  template: Pick<ChecklistTemplate, "userId" | "teamId" | "ownerType">,
  userId: string | null | undefined,
): boolean =>
  Boolean(userId) && template.userId === userId && !template.teamId && template.ownerType !== "team";
