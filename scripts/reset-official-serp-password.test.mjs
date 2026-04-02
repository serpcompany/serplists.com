import { describe, expect, it } from "vitest";

import {
  OFFICIAL_SERP_EMAIL,
  OFFICIAL_SERP_USER_ID,
  OFFICIAL_SERP_USERNAME,
  assertOfficialSerpInspectResults,
  buildOfficialSerpInspectSql,
  buildOfficialSerpResetSql,
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

  it("builds a transaction that only targets the official serp account", () => {
    const sql = buildOfficialSerpResetSql({
      passwordHash: "$2b$10$examplehash",
      nowMs: 1234567890,
    });

    expect(sql).toContain(`WHERE id = '${OFFICIAL_SERP_USER_ID}'`);
    expect(sql).toContain(`WHERE user_id = '${OFFICIAL_SERP_USER_ID}'`);
    expect(sql).toContain("email_verified = 1");
    expect(sql).toContain("provider_id = 'credential'");
    expect(sql).toContain("DELETE FROM session");
  });

  it("builds the live inspection query for the official account", () => {
    const sql = buildOfficialSerpInspectSql();

    expect(sql).toContain(`WHERE u.id = '${OFFICIAL_SERP_USER_ID}'`);
    expect(sql).toContain("FROM session");
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
