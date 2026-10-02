import type { BetterAuthOptions, User } from "better-auth";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";
import { createBetterAuth } from "@functions/api/better-auth";
import { getAuthEmailPolicy } from "@functions/api/utils/auth-policy";
import { betterAuthLogger } from "@functions/api/utils/better-auth-logger";
import { wranglerEnvVars } from "../../../support/wranglerToml";
import { apiEnv, withoutVars, type OptionalEnvVar } from "../../../support/apiEnv";
import type { Env } from "@functions/api/types";
import type {
  deliverAuthEmail,
  discardUnsentPasswordResetToken,
  shouldSendAuthEmail,
} from "@functions/api/utils/auth-email-throttle";

const { betterAuthMock, drizzleAdapterMock, emailThrottle } = vi.hoisted(() => ({
  betterAuthMock: vi.fn((_options: BetterAuthOptions) => ({ handler: vi.fn() })),
  drizzleAdapterMock: vi.fn(() => ({})),
  emailThrottle: {
    shouldSend: vi.fn<typeof shouldSendAuthEmail>(),
    deliver: vi.fn<typeof deliverAuthEmail>(),
    discardToken: vi.fn<typeof discardUnsentPasswordResetToken>(),
  },
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

vi.mock("@functions/api/utils/auth-email-throttle", () => ({
  deliverAuthEmail: emailThrottle.deliver,
  discardUnsentPasswordResetToken: emailThrottle.discardToken,
}));

function productionEnvWith(overrides: Partial<Env> = {}, without: readonly OptionalEnvVar[] = []): Env {
  const env = apiEnv({
    AUTH_EMAIL_VERIFICATION_REQUIRED: wranglerEnvVars("production").AUTH_EMAIL_VERIFICATION_REQUIRED,
    BETTER_AUTH_SECRET: "better-auth-secret-with-32-characters!!",
    FRONTEND_URL: "https://app.serplists.com",
    RESEND_API_KEY: "re_test_123",
    EMAIL_FROM: "SERP Lists <support@serplists.com>",
    ...overrides,
  });
  return withoutVars(env, without);
}

function defined<T>(value: T | undefined): T {
  assert.exists(value);
  return value;
}

const capturedOptions = () => defined(betterAuthMock.mock.calls[0]?.[0]);

const userWith = (fields: Partial<User> = {}): User => ({
  id: "user-1",
  name: "New User",
  email: "new-user@example.com",
  emailVerified: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...fields,
});

function stubFetchAnsweringOk() {
  const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function expectOneEmailPostedTo(fetchMock: ReturnType<typeof stubFetchAnsweringOk>, url: string) {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ method: "POST" }));
}

async function sendAResetEmailWith(env: Parameters<typeof createBetterAuth>[0]) {
  createBetterAuth(env, new Request("https://serplists.com/api/auth/request-password-reset"));
  await defined(capturedOptions().emailAndPassword?.sendResetPassword)(
    {
      user: userWith({ email: "existing-user@example.com" }),
      token: "reset-token",
      url: "https://serplists.com/reset-password?token=abc",
    },
    new Request("https://serplists.com/api/auth/request-password-reset")
  );
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
    createBetterAuth(productionEnvWith(), new Request("https://serplists.com/api/auth/sign-up/email"));

    expect(betterAuthMock).toHaveBeenCalledTimes(1);
    const options = capturedOptions();
    expect(options.emailAndPassword?.requireEmailVerification).toBe(true);
    expect(options.emailVerification?.sendOnSignUp).toBe(true);
    expect(typeof options.emailVerification?.sendVerificationEmail).toBe("function");
  });

  it("allows non-production account creation without email delivery", () => {
    const env = productionEnvWith({ AUTH_EMAIL_VERIFICATION_REQUIRED: "false" }, ["FRONTEND_URL", "RESEND_API_KEY", "USESEND_API_KEY"]);
    const request = new Request("http://localhost:8788/api/auth/sign-up/email");

    createBetterAuth(env, request);

    const options = capturedOptions();
    expect(getAuthEmailPolicy(env)).toEqual({
      accountRegistrationAvailable: true,
      emailAuthAvailable: false,
      emailVerificationRequired: false,
    });
    expect(options.emailAndPassword?.requireEmailVerification).toBe(false);
    expect(options.emailVerification?.sendOnSignUp).toBe(false);
    expect(options.plugins).toEqual([{ id: "username" }]);
  });

  it.each([
    ["production", productionEnvWith(), "https://serplists.com/api/auth/reset-password"],
    [
      "local",
      productionEnvWith({ AUTH_EMAIL_VERIFICATION_REQUIRED: "false" }, ["FRONTEND_URL", "RESEND_API_KEY"]),
      "http://localhost:8788/api/auth/reset-password",
    ],
  ])("revokes every session when a password is reset (%s), reading sessions from the database so it takes effect at once", (_label, env, url) => {
    createBetterAuth(env, new Request(url));

    const options = capturedOptions();
    expect(options.emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true);
    expect(options.session?.cookieCache?.enabled).not.toBe(true);
    expect(options.secondaryStorage).toBeUndefined();
  });

  it("routes Better Auth's own logs through the JSON logger, with no level that would also print errors through its default logger", () => {
    createBetterAuth(productionEnvWith(), new Request("https://serplists.com/api/auth/sign-in/email"));

    const options = capturedOptions();
    expect(options.logger).toBe(betterAuthLogger);
    expect(typeof options.logger?.log).toBe("function");
    expect(options.logger?.level).toBeUndefined();
    expect(options.logger?.disabled).not.toBe(true);
  });

  it("checks name and avatar on every user write but leaves internal updates alone", async () => {
    createBetterAuth(productionEnvWith(), new Request("https://serplists.com/api/auth/update-user"));
    const userHooks = capturedOptions().databaseHooks?.user;
    const beforeUpdate = defined(userHooks?.update?.before);
    const beforeCreate = defined(userHooks?.create?.before);
    const updatedAt = new Date();

    const internalUpdateWithoutNameOrImage = { emailVerified: true, updatedAt };
    await expect(beforeUpdate(internalUpdateWithoutNameOrImage)).resolves.toEqual({
      data: internalUpdateWithoutNameOrImage,
    });
    await expect(beforeUpdate({ name: "x".repeat(101) })).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      beforeUpdate({ image: "https://serplists.com/api/uploads/file?key=avatars%2Fu1%2Fa.png" })
    ).resolves.toEqual({ data: { image: "https://serplists.com/api/uploads/file?key=avatars%2Fu1%2Fa.png" } });
    const newUser = userWith({ email: "new@example.com", name: " Jo " });
    await expect(beforeCreate(newUser)).resolves.toEqual({ data: { ...newUser, name: "Jo" } });
    await expect(beforeCreate(userWith({ email: "new@example.com", name: "   " }))).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("enables breached-password checks when setting production passwords", () => {
    createBetterAuth(productionEnvWith(), new Request("https://serplists.com/api/auth/sign-up/email"));

    const options = capturedOptions();

    expect(options.plugins).toEqual([
      { id: "username" },
      { id: "haveIBeenPwned" },
    ]);
  });

  it.each(["https://staging.serplists.com", "https://staging.serp-checklists.pages.dev"])(
    "keeps production-only checks off under the preview policy on %s",
    async (origin) => {
      createBetterAuth(
        productionEnvWith({ AUTH_EMAIL_VERIFICATION_REQUIRED: "false", FRONTEND_URL: origin }),
        new Request(`${origin}/api/auth/sign-up/email`)
      );

      const options = capturedOptions();
      expect(options.plugins).toEqual([{ id: "username" }]);
      await expect(
        defined(options.databaseHooks?.user?.create?.before)(userWith({ email: "qa-bot@serplists.dev", name: "QA" }))
      ).resolves.toMatchObject({ data: { email: "qa-bot@serplists.dev" } });
    }
  );

  it("does not check breached passwords on production sign-in", () => {
    createBetterAuth(productionEnvWith(), new Request("https://serplists.com/api/auth/sign-in/email"));

    const options = capturedOptions();

    expect(options.plugins).toEqual([{ id: "username" }]);
  });

  it("requires production account verification to have email delivery", () => {
    const env = productionEnvWith({}, ["RESEND_API_KEY", "USESEND_API_KEY"]);

    expect(getAuthEmailPolicy(env)).toEqual({
      accountRegistrationAvailable: false,
      emailAuthAvailable: false,
      emailVerificationRequired: true,
    });
  });

  it("trusts only the request origin when no frontend origins are configured", () => {
    createBetterAuth(
      productionEnvWith({}, ["FRONTEND_URL", "CORS_ALLOWED_ORIGINS"]),
      new Request("https://api.serplists.com/api/auth/sign-in/email")
    );

    const options = capturedOptions();

    expect(options.trustedOrigins).toEqual(["https://api.serplists.com"]);
  });

  it("includes configured frontend and CORS origins in trusted origins", () => {
    createBetterAuth(
      productionEnvWith({
        FRONTEND_URL: "http://localhost:8080",
        CORS_ALLOWED_ORIGINS: "http://127.0.0.1:4173, https://preview.serplists.com",
      }),
      new Request("http://localhost:8788/api/auth/sign-in/email")
    );

    const options = capturedOptions();

    expect(options.trustedOrigins).toEqual([
      "http://localhost:8788",
      "http://localhost:8080",
      "http://127.0.0.1:4173",
      "https://preview.serplists.com",
    ]);
  });

  it("sends verification emails through Resend", async () => {
    const fetchMock = stubFetchAnsweringOk();

    createBetterAuth(productionEnvWith(), new Request("https://serplists.com/api/auth/sign-up/email"));
    const options = capturedOptions();

    await defined(options.emailVerification?.sendVerificationEmail)(
      {
        user: userWith({ email: "new-user@example.com" }),
        url: "https://serplists.com/api/auth/verify-email?token=abc",
        token: "abc",
      },
      new Request("https://serplists.com/api/auth/sign-up/email")
    );

    expectOneEmailPostedTo(fetchMock, "https://api.resend.com/emails");
  });

  it("sends password reset emails through Resend", async () => {
    const fetchMock = stubFetchAnsweringOk();

    await sendAResetEmailWith(productionEnvWith());

    expectOneEmailPostedTo(fetchMock, "https://api.resend.com/emails");
  });

  it("skips a throttled reset email without failing and discards its unused token", async () => {
    const fetchMock = stubFetchAnsweringOk();
    emailThrottle.shouldSend.mockResolvedValue(false);
    const env = productionEnvWith();

    createBetterAuth(env, new Request("https://serplists.com/api/auth/request-password-reset"));
    const options = capturedOptions();

    await expect(
      defined(options.emailAndPassword?.sendResetPassword)(
        { user: userWith({ id: "u1", email: "existing-user@example.com" }), url: "https://serplists.com/r", token: "tok" },
        new Request("https://serplists.com/api/auth/request-password-reset")
      )
    ).resolves.toBeUndefined();

    expect(emailThrottle.shouldSend).toHaveBeenCalledWith(env, "password-reset", "u1");
    expect(emailThrottle.discardToken).toHaveBeenCalledWith(env, "tok");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not send verification email to a verified address or past the throttle", async () => {
    const fetchMock = stubFetchAnsweringOk();

    createBetterAuth(productionEnvWith(), new Request("https://serplists.com/api/auth/send-verification-email"));
    const options = capturedOptions();
    const send = (user: User) =>
      defined(options.emailVerification?.sendVerificationEmail)(
        { user, url: "https://serplists.com/api/auth/verify-email?token=abc", token: "abc" },
        new Request("https://serplists.com/api/auth/send-verification-email")
      );

    await send(userWith({ id: "u1", email: "verified@example.com", emailVerified: true }));
    expect(emailThrottle.shouldSend).not.toHaveBeenCalled();

    emailThrottle.shouldSend.mockResolvedValue(false);
    await send(userWith({ id: "u2", email: "new@example.com", emailVerified: false }));
    expect(emailThrottle.shouldSend).toHaveBeenCalledWith(expect.anything(), "email-verification", "u2");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets sign-up succeed when the verification email fails, but not other senders", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 429 })));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    createBetterAuth(productionEnvWith(), new Request("https://serplists.com/api/auth/sign-up/email"));
    const options = capturedOptions();
    const user = userWith({ id: "u1", email: "new-user@example.com", emailVerified: false });
    const verify = (request?: Request) =>
      defined(options.emailVerification?.sendVerificationEmail)(
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
      defined(options.emailAndPassword?.sendResetPassword)(
        { user, url: "https://serplists.com/reset-password?token=abc", token: "abc" },
        new Request("https://serplists.com/api/auth/request-password-reset")
      )
    ).rejects.toMatchObject({ name: "AuthEmailDeliveryError" });
  });

  it("falls back to UseSend when RESEND_API_KEY is not configured", async () => {
    const fetchMock = stubFetchAnsweringOk();

    await sendAResetEmailWith(productionEnvWith({ USESEND_API_KEY: "us_test_123" }, ["RESEND_API_KEY"]));

    expectOneEmailPostedTo(fetchMock, "https://app.usesend.com/api/v1/emails");
  });

  it("fails loudly when no auth email provider is configured", async () => {
    const fetchMock = stubFetchAnsweringOk();

    createBetterAuth(
      productionEnvWith({}, ["RESEND_API_KEY", "USESEND_API_KEY"]),
      new Request("https://serplists.com/api/auth/sign-up/email")
    );
    const options = capturedOptions();

    await expect(
      defined(options.emailVerification?.sendVerificationEmail)(
        {
          user: userWith({ email: "new-user@example.com" }),
          url: "https://serplists.com/api/auth/verify-email?token=abc",
          token: "abc",
        },
        new Request("https://serplists.com/api/auth/sign-up/email")
      )
    ).rejects.toThrow(/Auth email provider is not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
