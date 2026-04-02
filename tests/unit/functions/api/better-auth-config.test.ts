import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBetterAuth } from "@functions/api/better-auth";

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
