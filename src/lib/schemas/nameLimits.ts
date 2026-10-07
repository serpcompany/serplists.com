import { RUN_TITLE_MAX } from "./templateLimits";

export { RUN_TITLE_MAX };
export const ORGANIZATION_NAME_MAX = 120;
export const ORGANIZATION_DESCRIPTION_MAX = 500;

export const getRunTitleError = (title: string): string | null => {
  const trimmed = title.trim();
  if (!trimmed) return "Run title cannot be empty.";
  return trimmed.length > RUN_TITLE_MAX ? `Run title must be ${RUN_TITLE_MAX} characters or fewer.` : null;
};

export const getOrganizationNameError = (name: string): string | null => {
  const trimmed = name.trim();
  if (!trimmed) return "Organization name is required";
  return trimmed.length > ORGANIZATION_NAME_MAX
    ? `Organization name must be ${ORGANIZATION_NAME_MAX} characters or fewer.`
    : null;
};
