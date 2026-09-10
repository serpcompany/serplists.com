import {
  OFFICIAL_SERP_EMAIL,
  OFFICIAL_SERP_USER_ID,
  OFFICIAL_SERP_USERNAME,
} from "./reset-official-serp-password-lib.mjs";

export const OFFICIAL_SERP_PRO_NOTE = "Official publisher Pro override";

export function validatePlan(plan) {
  if (plan !== "pro" && plan !== "free") {
    return { ok: false, message: "Plan must be 'pro' or 'free'." };
  }

  return { ok: true, normalizedPlan: plan };
}

export function assertOfficialSerpPlanInspectResults(results) {
  const [userResult, overrideResult] = results ?? [];
  const userRow = userResult?.results?.[0];
  const overrideRow = overrideResult?.results?.[0] ?? null;

  if (!userRow) {
    throw new Error(`Official publisher ${OFFICIAL_SERP_USER_ID} was not found.`);
  }

  if (userRow.email !== OFFICIAL_SERP_EMAIL) {
    throw new Error(`Expected ${OFFICIAL_SERP_USER_ID} email to be ${OFFICIAL_SERP_EMAIL}, received ${userRow.email ?? "null"}.`);
  }

  if (userRow.username !== OFFICIAL_SERP_USERNAME) {
    throw new Error(`Expected ${OFFICIAL_SERP_USER_ID} username to be ${OFFICIAL_SERP_USERNAME}, received ${userRow.username ?? "null"}.`);
  }

  return {
    userRow,
    overrideRow,
  };
}
