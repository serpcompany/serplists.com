import { signJWT } from "better-auth/crypto";
import { describe, expect, it } from "vitest";

import { createBetterAuth } from "@functions/api/better-auth";
import { EMAIL_VERIFIED_CALLBACK_URL, getLoginNotice } from "@/lib/auth/loginNotice";

// Pins the Better Auth redirect contract that Login's notice parsing relies on.
// A failed verification link must land on the callback with `error=<code>`
// appended; if an upgrade changes that shape, this fails instead of Login
// silently showing "Email verified" again.

const SECRET = "better-auth-secret-with-32-characters!!";

function buildEnv() {
  return {
    BETTER_AUTH_SECRET: SECRET,
    AUTH_EMAIL_VERIFICATION_REQUIRED: "true",
    RESEND_API_KEY: "re_test_123",
    DB: {},
  } as any;
}

async function visitVerificationLink(token: string) {
  // Better Auth 1.3.4 builds the email link without encoding callbackURL.
  const url = `http://localhost:8788/api/auth/verify-email?token=${token}&callbackURL=${EMAIL_VERIFIED_CALLBACK_URL}`;
  const request = new Request(url);
  const auth = createBetterAuth(buildEnv(), request);
  const response = await auth.handler(request);
  return { status: response.status, location: response.headers.get("location") };
}

describe("verify-email failure redirect", () => {
  it("appends error=token_expired to the callback for an expired link", async () => {
    const token = await signJWT({ email: "person@example.com" }, SECRET, -60);

    const { status, location } = await visitVerificationLink(token);

    expect(status).toBe(302);
    expect(location).toBe("/login?verified=1&error=token_expired");
    expect(getLoginNotice(new URL(location!, "http://x").search)).toMatchObject({
      kind: "verification_failed",
      reason: "token_expired",
    });
  });

  it("appends error=invalid_token to the callback for a link signed with another secret", async () => {
    const token = await signJWT({ email: "person@example.com" }, "another-secret-with-32-characters!!!!", 3600);

    const { status, location } = await visitVerificationLink(token);

    expect(status).toBe(302);
    expect(location).toBe("/login?verified=1&error=invalid_token");
    expect(getLoginNotice(new URL(location!, "http://x").search)?.kind).toBe("verification_failed");
  });
});
