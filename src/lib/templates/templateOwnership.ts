import type { ChecklistTemplate } from "@/types/checklist";

export const isPersonalTemplateOf = (
  template: Pick<ChecklistTemplate, "userId" | "teamId" | "ownerType">,
  userId: string | null | undefined,
): boolean =>
  Boolean(userId) && template.userId === userId && !template.teamId && template.ownerType !== "team";

export const isOrganizationTemplate = (
  template: Pick<ChecklistTemplate, "owner" | "ownerType" | "teamId">,
): boolean =>
  template.owner ? template.owner.type === "team" : template.ownerType === "team" || Boolean(template.teamId);
