import { describe, expect, it } from "vitest";

import {
  OFFICIAL_SERP_EMAIL,
  OFFICIAL_SERP_USER_ID,
  OFFICIAL_SERP_USERNAME,
  assertOfficialSerpInspectResults,
  validateOfficialPassword,
} from "./reset-official-serp-password-lib.mjs";

describe("reset-official-serp-password helpers", () => {
  it("accepts passwords that match the live auth policy", () => {
    expect(validateOfficialPassword("123456789")).toEqual({
      ok: false,
      message: "Password must be at least 10 characters.",
    });
    expect(validateOfficialPassword("  strong-pass-123  ")).toEqual({
      ok: true,
      normalizedPassword: "strong-pass-123",
    });
  });

  it("rejects inspection results that do not match the official account contract", () => {
    expect(() =>
      assertOfficialSerpInspectResults([
        {
          results: [
            {
              id: OFFICIAL_SERP_USER_ID,
              email: "wrong@example.com",
              username: OFFICIAL_SERP_USERNAME,
              provider_id: "credential",
              account_id: OFFICIAL_SERP_USER_ID,
            },
          ],
        },
        { results: [{ session_count: 0 }] },
      ]),
    ).toThrow(`Expected ${OFFICIAL_SERP_USER_ID} email to be ${OFFICIAL_SERP_EMAIL}`);
  });
});
