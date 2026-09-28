import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBetterAuth, getAuthEmailPolicy } from "@functions/api/better-auth";

const { betterAuthMock, drizzleAdapterMock } = vi.hoisted(() => ({
  betterAuthMock: vi.fn(() => ({ handler: vi.fn() })),
  drizzleAdapterMock: vi.fn(() => ({})),
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

function buildEnv(overrides?: Record<string, unknown>) {
  return {
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
      FRONTEND_URL: undefined,
      RESEND_API_KEY: undefined,
      USESEND_API_KEY: undefined,
    });
    const request = new Request("http://localhost:8788/api/auth/sign-up/email");

    createBetterAuth(env, request);

    const options = betterAuthMock.mock.calls[0]?.[0];
    expect(getAuthEmailPolicy(env, request)).toEqual({
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
      buildEnv({ FRONTEND_URL: undefined, RESEND_API_KEY: undefined }),
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
    const request = new Request("https://serplists.com/api/auth/sign-up/email");

    expect(getAuthEmailPolicy(env, request)).toEqual({
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
