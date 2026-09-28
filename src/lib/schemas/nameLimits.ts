// Name limits the API enforces, measured after trimming: run titles (checklistPayloadSchema
// in functions/api/utils/payloads.ts) and Organization names (the team schemas in
// functions/api/handlers/teams.ts). The app caps its inputs and checks names with the same
// numbers, so a long name gets a clear message instead of the API's raw schema error.
// maxLength and String.length both count UTF-16 code units, as Zod does.

import { RUN_TITLE_MAX } from "./templateLimits";

// The run title limit lives with the other write limits in ./templateLimits.ts.
export { RUN_TITLE_MAX };
export const ORGANIZATION_NAME_MAX = 120;

// Why a run title cannot be saved, or null when it can.
export const getRunTitleError = (title: string): string | null => {
  const trimmed = title.trim();
  if (!trimmed) return "Run title cannot be empty.";
  return trimmed.length > RUN_TITLE_MAX ? `Run title must be ${RUN_TITLE_MAX} characters or fewer.` : null;
};

// Why an Organization name cannot be saved, or null when it can.
export const getOrganizationNameError = (name: string): string | null => {
  const trimmed = name.trim();
  if (!trimmed) return "Organization name is required";
  return trimmed.length > ORGANIZATION_NAME_MAX
    ? `Organization name must be ${ORGANIZATION_NAME_MAX} characters or fewer.`
    : null;
};
