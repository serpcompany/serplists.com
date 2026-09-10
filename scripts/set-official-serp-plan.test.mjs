import { describe, expect, it } from "vitest";

import {
  OFFICIAL_SERP_PRO_NOTE,
  assertOfficialSerpPlanInspectResults,
  validatePlan,
} from "./set-official-serp-plan-lib.mjs";
import {
  OFFICIAL_SERP_EMAIL,
  OFFICIAL_SERP_USER_ID,
  OFFICIAL_SERP_USERNAME,
} from "./reset-official-serp-password-lib.mjs";

describe("set-official-serp-plan helpers", () => {
  it("accepts only supported plan values", () => {
    expect(validatePlan("enterprise")).toEqual({
      ok: false,
      message: "Plan must be 'pro' or 'free'.",
    });
    expect(validatePlan("pro")).toEqual({
      ok: true,
      normalizedPlan: "pro",
    });
  });

  it("rejects inspection results that do not match the official account contract", () => {
    expect(() =>
      assertOfficialSerpPlanInspectResults([
        {
          results: [
            {
              id: OFFICIAL_SERP_USER_ID,
              email: OFFICIAL_SERP_EMAIL,
              username: "wrong",
            },
          ],
        },
        { results: [] },
      ]),
    ).toThrow(`Expected ${OFFICIAL_SERP_USER_ID} username to be ${OFFICIAL_SERP_USERNAME}`);
  });
});
