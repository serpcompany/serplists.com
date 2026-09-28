import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { signJWT } from "better-auth/crypto";
import { describe, expect, it } from "vitest";

import { createBetterAuth } from "@functions/api/better-auth";
import {
  buildEmailVerifiedCallbackURL,
  EMAIL_VERIFIED_CALLBACK_URL,
  getLoginNotice,
} from "@/lib/auth/loginNotice";
import { getReturnPath } from "@/lib/auth/returnPath";

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

// A new invitee who signs up from an invite link must come back to it after
// verifying their email. The return path rides in the callback as `next`,
// which only survives Better Auth's unencoded email link because
// buildEmailVerifiedCallbackURL encodes it one extra time.
describe("verification return path round trip", () => {
  async function signUpAndOpenVerificationLink(returnPath: string) {
    const sentLinks: string[] = [];
    const auth = betterAuth({
      secret: SECRET,
      baseURL: "http://localhost:8788",
      trustedOrigins: ["http://localhost:8788"],
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      emailAndPassword: { enabled: true, requireEmailVerification: true },
      emailVerification: {
        sendOnSignUp: true,
        sendVerificationEmail: async ({ url }) => {
          sentLinks.push(url);
        },
      },
    });

    const signUp = await auth.handler(
      new Request("http://localhost:8788/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:8788" },
        body: JSON.stringify({
          name: "New Invitee",
          email: "new-invitee@example.com",
          password: "a-long-enough-password",
          callbackURL: buildEmailVerifiedCallbackURL(returnPath),
        }),
      }),
    );
    expect(signUp.status).toBe(200);
    expect(sentLinks).toHaveLength(1);

    const verify = await auth.handler(new Request(sentLinks[0]!));
    return { status: verify.status, location: verify.headers.get("location") };
  }

  it.each([
    "/team-invites/abc_DEF-123",
    "/team-invites/abc?x=1#h",
    "/templates/launch-(v2)!~*'",
  ])("returns to %s after verification", async (returnPath) => {
    const { status, location } = await signUpAndOpenVerificationLink(returnPath);

    expect(status).toBe(302);
    const search = new URL(location!, "http://x").search;
    expect(getLoginNotice(search)?.kind).toBe("verified");
    expect(getReturnPath({ search })).toBe(returnPath);
  });
});
