import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBetterAuth } from "@functions/api/better-auth";
import { getAuthEmailPolicy } from "@functions/api/utils/auth-policy";
import { betterAuthLogger } from "@functions/api/utils/better-auth-logger";

const { betterAuthMock, drizzleAdapterMock, emailThrottle } = vi.hoisted(() => ({
  betterAuthMock: vi.fn(() => ({ handler: vi.fn() })),
  drizzleAdapterMock: vi.fn(() => ({})),
  emailThrottle: { shouldSend: vi.fn(), deliver: vi.fn(), discardToken: vi.fn() },
}));

vi.mock("better-auth", () => ({
  betterAuth: betterAuthMock,
}));

vi.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: drizzleAdapterMock,
}));

vi.mock("better-auth/plugins", () => ({
  username: vi.fn(() => ({ id: "username" })),
  haveIBeenPwned: vi.fn(() => ({ id: "haveIBeenPwned" })),
}));

vi.mock("@functions/api/db", () => ({
  createDb: vi.fn(() => ({})),
  schema: {},
}));

// The throttle itself runs against SQLite in auth-email-throttle.test.ts.
vi.mock("@functions/api/utils/auth-email-throttle", () => ({
  deliverAuthEmail: emailThrottle.deliver,
  discardUnsentPasswordResetToken: emailThrottle.discardToken,
}));

// Production, as wrangler.toml configures it; local and preview set "false".
function buildEnv(overrides?: Record<string, unknown>) {
  return {
    AUTH_EMAIL_VERIFICATION_REQUIRED: "true",
    BETTER_AUTH_SECRET: "better-auth-secret-with-32-characters!!",
    FRONTEND_URL: "https://app.serplists.com",
    RESEND_API_KEY: "re_test_123",
    EMAIL_FROM: "SERP Lists <support@serplists.com>",
    ...overrides,
  } as any;
}

describe("createBetterAuth config", () => {
  beforeEach(() => {
    betterAuthMock.mockClear();
    drizzleAdapterMock.mockClear();
    vi.restoreAllMocks();
    emailThrottle.shouldSend.mockReset().mockResolvedValue(true);
    emailThrottle.deliver.mockReset().mockImplementation(async (env, kind, userId, send) => {
      if (!(await emailThrottle.shouldSend(env, kind, userId))) return false;
      await send();
      return true;
    });
    emailThrottle.discardToken.mockReset().mockResolvedValue(undefined);
  });

  it("enforces email verification and wires verification sender", () => {
    createBetterAuth(buildEnv(), new Request("https://serplists.com/api/auth/sign-up/email"));

    expect(betterAuthMock).toHaveBeenCalledTimes(1);
    const options = betterAuthMock.mock.calls[0]?.[0];
    expect(options.emailAndPassword.requireEmailVerification).toBe(true);
    expect(options.emailVerification.sendOnSignUp).toBe(true);
    expect(typeof options.emailVerification.sendVerificationEmail).toBe("function");
  });

  it("allows non-production account creation without email delivery", () => {
    const env = buildEnv({
      AUTH_EMAIL_VERIFICATION_REQUIRED: "false",
      FRONTEND_URL: undefined,
      RESEND_API_KEY: undefined,
      USESEND_API_KEY: undefined,
    });
    const request = new Request("http://localhost:8788/api/auth/sign-up/email");

    createBetterAuth(env, request);

    const options = betterAuthMock.mock.calls[0]?.[0];
    expect(getAuthEmailPolicy(env)).toEqual({
      accountRegistrationAvailable: true,
      emailAuthAvailable: false,
      emailVerificationRequired: false,
    });
    expect(options.emailAndPassword.requireEmailVerification).toBe(false);
    expect(options.emailVerification.sendOnSignUp).toBe(false);
    expect(options.plugins).toEqual([{ id: "username" }]);
  });

  it.each([
    ["production", buildEnv(), "https://serplists.com/api/auth/reset-password"],
    [
      "local",
      buildEnv({ AUTH_EMAIL_VERIFICATION_REQUIRED: "false", FRONTEND_URL: undefined, RESEND_API_KEY: undefined }),
      "http://localhost:8788/api/auth/reset-password",
    ],
  ])("revokes every session when a password is reset (%s)", (_label, env, url) => {
    createBetterAuth(env, new Request(url));

    const options = betterAuthMock.mock.calls[0]?.[0];
    expect(options.emailAndPassword.revokeSessionsOnPasswordReset).toBe(true);
    // Revocation is immediate only while sessions are read from the database.
    expect(options.session?.cookieCache?.enabled).not.toBe(true);
    expect(options.secondaryStorage).toBeUndefined();
  });

  it("routes Better Auth's own logs through the JSON logger", () => {
    createBetterAuth(buildEnv(), new Request("https://serplists.com/api/auth/sign-in/email"));

    const options = betterAuthMock.mock.calls[0]?.[0];
    // The default logger prints emails to the console (better-auth-logger.test.ts).
    expect(options.logger).toBe(betterAuthLogger);
    expect(typeof options.logger.log).toBe("function");
    // Setting a level makes Better Auth 1.3.4 also print API errors through its
    // default console logger, bypassing log().
    expect(options.logger.level).toBeUndefined();
    expect(options.logger.disabled).not.toBe(true);
  });

  it("checks name and avatar on every user write but leaves internal updates alone", async () => {
    createBetterAuth(buildEnv(), new Request("https://serplists.com/api/auth/update-user"));
    const userHooks = betterAuthMock.mock.calls[0]?.[0].databaseHooks.user;
    const updatedAt = new Date();

    // Email verification and timestamp updates carry no name or image.
    await expect(userHooks.update.before({ emailVerified: true, updatedAt })).resolves.toEqual({
      data: { emailVerified: true, updatedAt },
    });
    await expect(userHooks.update.before({ name: "x".repeat(101) })).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      userHooks.update.before({ image: "https://serplists.com/api/uploads/file?key=avatars%2Fu1%2Fa.png" })
    ).resolves.toEqual({ data: { image: "https://serplists.com/api/uploads/file?key=avatars%2Fu1%2Fa.png" } });
    await expect(userHooks.create.before({ email: "new@example.com", name: " Jo " })).resolves.toEqual({
      data: { email: "new@example.com", name: "Jo" },
    });
    await expect(userHooks.create.before({ email: "new@example.com" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("enables breached-password checks when setting production passwords", () => {
    createBetterAuth(buildEnv(), new Request("https://serplists.com/api/auth/sign-up/email"));

    const options = betterAuthMock.mock.calls[0]?.[0];

    expect(options.plugins).toEqual([
      { id: "username" },
      { id: "haveIBeenPwned" },
    ]);
  });

  it.each(["https://staging.serplists.com", "https://staging.serp-checklists.pages.dev"])(
    "keeps production-only checks off under the preview policy on %s",
    async (origin) => {
      createBetterAuth(
        buildEnv({ AUTH_EMAIL_VERIFICATION_REQUIRED: "false", FRONTEND_URL: origin }),
        new Request(`${origin}/api/auth/sign-up/email`)
      );

      const options = betterAuthMock.mock.calls[0]?.[0];
      expect(options.plugins).toEqual([{ id: "username" }]);
      await expect(
        options.databaseHooks.user.create.before({ email: "qa-bot@serplists.dev", name: "QA" })
      ).resolves.toMatchObject({ data: { email: "qa-bot@serplists.dev" } });
    }
  );

  it("does not check breached passwords on production sign-in", () => {
    createBetterAuth(buildEnv(), new Request("https://serplists.com/api/auth/sign-in/email"));

    const options = betterAuthMock.mock.calls[0]?.[0];

    expect(options.plugins).toEqual([{ id: "username" }]);
  });

  it("requires production account verification to have email delivery", () => {
    const env = buildEnv({
      RESEND_API_KEY: undefined,
      USESEND_API_KEY: undefined,
    });

    expect(getAuthEmailPolicy(env)).toEqual({
      accountRegistrationAvailable: false,
      emailAuthAvailable: false,
      emailVerificationRequired: true,
    });
  });

  it("trusts only the request origin when no frontend origins are configured", () => {
    createBetterAuth(
      buildEnv({
        FRONTEND_URL: undefined,
        CORS_ALLOWED_ORIGINS: undefined,
      }),
      new Request("https://api.serplists.com/api/auth/sign-in/email")
    );

    const options = betterAuthMock.mock.calls[0]?.[0];

    expect(options.trustedOrigins).toEqual(["https://api.serplists.com"]);
  });

  it("includes configured frontend and CORS origins in trusted origins", () => {
    createBetterAuth(
      buildEnv({
        FRONTEND_URL: "http://localhost:8080",
        CORS_ALLOWED_ORIGINS: "http://127.0.0.1:4173, https://preview.serplists.com",
      }),
      new Request("http://localhost:8788/api/auth/sign-in/email")
    );

    const options = betterAuthMock.mock.calls[0]?.[0];

    expect(options.trustedOrigins).toEqual([
      "http://localhost:8788",
      "http://localhost:8080",
      "http://127.0.0.1:4173",
      "https://preview.serplists.com",
    ]);
  });

  it("sends verification emails through Resend", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    createBetterAuth(buildEnv(), new Request("https://serplists.com/api/auth/sign-up/email"));
    const options = betterAuthMock.mock.calls[0]?.[0];

    await options.emailVerification.sendVerificationEmail(
      {
        user: { email: "new-user@example.com" },
        url: "https://serplists.com/api/auth/verify-email?token=abc",
        token: "abc",
      },
      new Request("https://serplists.com/api/auth/sign-up/email")
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("sends password reset emails through Resend", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    createBetterAuth(buildEnv(), new Request("https://serplists.com/api/auth/request-password-reset"));
    const options = betterAuthMock.mock.calls[0]?.[0];

    await options.emailAndPassword.sendResetPassword(
      {
        user: { email: "existing-user@example.com" },
        url: "https://serplists.com/reset-password?token=abc",
      },
      new Request("https://serplists.com/api/auth/request-password-reset")
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("skips a throttled reset email without failing and discards its unused token", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    emailThrottle.shouldSend.mockResolvedValue(false);
    const env = buildEnv();

    createBetterAuth(env, new Request("https://serplists.com/api/auth/request-password-reset"));
    const options = betterAuthMock.mock.calls[0]?.[0];

    await expect(
      options.emailAndPassword.sendResetPassword(
        { user: { id: "u1", email: "existing-user@example.com" }, url: "https://serplists.com/r", token: "tok" },
        new Request("https://serplists.com/api/auth/request-password-reset")
      )
    ).resolves.toBeUndefined();

    expect(emailThrottle.shouldSend).toHaveBeenCalledWith(env, "password-reset", "u1");
    expect(emailThrottle.discardToken).toHaveBeenCalledWith(env, "tok");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not send verification email to a verified address or past the throttle", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    createBetterAuth(buildEnv(), new Request("https://serplists.com/api/auth/send-verification-email"));
    const options = betterAuthMock.mock.calls[0]?.[0];
    const send = (user: Record<string, unknown>) =>
      options.emailVerification.sendVerificationEmail(
        { user, url: "https://serplists.com/api/auth/verify-email?token=abc", token: "abc" },
        new Request("https://serplists.com/api/auth/send-verification-email")
      );

    await send({ id: "u1", email: "verified@example.com", emailVerified: true });
    expect(emailThrottle.shouldSend).not.toHaveBeenCalled();

    emailThrottle.shouldSend.mockResolvedValue(false);
    await send({ id: "u2", email: "new@example.com", emailVerified: false });
    expect(emailThrottle.shouldSend).toHaveBeenCalledWith(expect.anything(), "email-verification", "u2");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets sign-up succeed when the verification email fails, but not other senders", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 429 })));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    createBetterAuth(buildEnv(), new Request("https://serplists.com/api/auth/sign-up/email"));
    const options = betterAuthMock.mock.calls[0]?.[0];
    const user = { id: "u1", email: "new-user@example.com", emailVerified: false };
    const verify = (request?: Request) =>
      options.emailVerification.sendVerificationEmail(
        { user, url: "https://serplists.com/api/auth/verify-email?token=abc", token: "abc" },
        request
      );

    await expect(verify(new Request("https://serplists.com/api/auth/sign-up/email"))).resolves.toBeUndefined();
    await expect(verify(new Request("https://serplists.com/api/auth/send-verification-email"))).rejects.toMatchObject({
      name: "AuthEmailDeliveryError",
      status: 429,
    });
    await expect(verify(undefined)).rejects.toMatchObject({ name: "AuthEmailDeliveryError" });
    await expect(
      options.emailAndPassword.sendResetPassword(
        { user, url: "https://serplists.com/reset-password?token=abc", token: "abc" },
        new Request("https://serplists.com/api/auth/request-password-reset")
      )
    ).rejects.toMatchObject({ name: "AuthEmailDeliveryError" });
  });

  it("falls back to UseSend when RESEND_API_KEY is not configured", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    createBetterAuth(
      buildEnv({
        RESEND_API_KEY: undefined,
        USESEND_API_KEY: "us_test_123",
      }),
      new Request("https://serplists.com/api/auth/request-password-reset")
    );
    const options = betterAuthMock.mock.calls[0]?.[0];

    await options.emailAndPassword.sendResetPassword(
      {
        user: { email: "existing-user@example.com" },
        url: "https://serplists.com/reset-password?token=abc",
      },
      new Request("https://serplists.com/api/auth/request-password-reset")
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.usesend.com/api/v1/emails",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("fails loudly when no auth email provider is configured", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    createBetterAuth(
      buildEnv({
        RESEND_API_KEY: undefined,
        USESEND_API_KEY: undefined,
      }),
      new Request("https://serplists.com/api/auth/sign-up/email")
    );
    const options = betterAuthMock.mock.calls[0]?.[0];

    await expect(
      options.emailVerification.sendVerificationEmail(
        {
          user: { email: "new-user@example.com" },
          url: "https://serplists.com/api/auth/verify-email?token=abc",
          token: "abc",
        },
        new Request("https://serplists.com/api/auth/sign-up/email")
      )
    ).rejects.toThrow(/Auth email provider is not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
