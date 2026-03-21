import { describe, expect, it } from "vitest";
import {
  DEV_TEST_USER_DEFAULT_PASSWORD,
  DEV_TEST_USER_PASSWORD_RESET_COMMAND,
  DEV_TEST_USERS,
  getDevTestUserPasswordHelp,
} from "@/lib/auth/devUsers";

describe("devUsers", () => {
  it("defines the seeded local personas in one place", () => {
    expect(DEV_TEST_USERS.map((user) => user.email)).toEqual([
      "admin@test.com",
      "john@test.com",
      "jane@test.com",
      "bob@test.com",
    ]);
  });

  it("includes the documented password recovery command in the helper copy", () => {
    expect(DEV_TEST_USER_DEFAULT_PASSWORD).toBe("password123");
    expect(DEV_TEST_USER_PASSWORD_RESET_COMMAND).toBe("pnpm run db:reset:test-user-passwords");
    expect(getDevTestUserPasswordHelp()).toContain("password123");
    expect(getDevTestUserPasswordHelp()).toContain("pnpm run db:reset:test-user-passwords");
  });
});
