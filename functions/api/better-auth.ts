import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { haveIBeenPwned, username } from "better-auth/plugins";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Env } from "./types";
import { createDb, schema } from "./db";
import { resolveAuthSecret } from "./utils/auth-secret";
import { resolveTrustedOrigins } from "./utils/cors";
import {
  AuthEmailDeliveryError,
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
} from "./utils/auth-email";
import { getAuthEmailPolicy, isProductionAuthPolicy } from "./utils/auth-policy";
import { deliverAuthEmail, discardUnsentPasswordResetToken } from "./utils/auth-email-throttle";
import { log } from "./utils/logger";
import { betterAuthLogger } from "./utils/better-auth-logger";
import { assertNotBlockedTestEmail } from "./utils/test-email-block";
import { buildUserProfileWritePolicy, validateUserProfileWrite } from "./utils/user-profile-validation";
import { assertUsernameAvailableForUpdate, mapUsernameConflicts } from "./utils/username-conflict";
import { rejectInvalidNewPassword } from "./utils/password-length";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "../../src/lib/schemas/passwordLimits";

function isSignUpRequest(request: Request | undefined): boolean {
  return request !== undefined && new URL(request.url).pathname.endsWith("/auth/sign-up/email");
}

function shouldCheckBreachedPassword(env: Env, request: Request): boolean {
  if (!isProductionAuthPolicy(env)) {
    return false;
  }

  const pathname = new URL(request.url).pathname;
  return (
    pathname.endsWith("/auth/sign-up/email") ||
    pathname.endsWith("/auth/change-password") ||
    pathname.endsWith("/auth/reset-password")
  );
}

export function createBetterAuth(env: Env, request: Request) {
  const authSecret = resolveAuthSecret(env);
  const authEmailPolicy = getAuthEmailPolicy(env);

  const origin = new URL(request.url).origin;
  // The router's auth request guard checks Origin against the same set.
  const trustedOrigins = resolveTrustedOrigins(request, env);
  const isSecure = origin.startsWith("https://");
  const blockTestAccounts = isProductionAuthPolicy(env);
  const userProfilePolicy = buildUserProfileWritePolicy(env, trustedOrigins);

  const db = createDb(env);
  const plugins = [
    username(),
    ...(shouldCheckBreachedPassword(env, request)
      ? [
          haveIBeenPwned({
            customPasswordCompromisedMessage:
              "Please choose a less common password.",
          }),
        ]
      : []),
  ];

  return betterAuth({
    // Pinned so Better Auth never derives it from the request: with no baseURL,
    // 1.3.4 builds reset and verification links from X-Forwarded-Host, which a
    // client can set. On Cloudflare, request.url's host is one routed to this
    // project. Must be an origin with no path, or basePath is not appended.
    baseURL: origin,
    basePath: "/api/auth",
    secret: authSecret,
    // The default logger prints emails to the console; this one writes scrubbed JSON.
    logger: betterAuthLogger,
    trustedOrigins: Array.from(trustedOrigins),
    database: mapUsernameConflicts(
      drizzleAdapter(db, {
        provider: "sqlite",
        schema,
      })
    ),
    emailAndPassword: {
      enabled: true,
      // Throttled per account (utils/auth-email-throttle.ts). A skipped send
      // returns normally, so the response is the same as for a sent email.
      sendResetPassword: async ({ user, url, token }) => {
        const sent = await deliverAuthEmail(env, "password-reset", user.id, () =>
          sendPasswordResetEmail(env, { to: user.email, url })
        );
        if (!sent) await discardUnsentPasswordResetToken(env, token);
      },
      // A reset is how users recover a compromised account, so it must sign out
      // every existing session (Better Auth deletes the user's session rows).
      // This is immediate only while sessions are read from D1: enabling
      // session.cookieCache would keep revoked sessions alive until it expires.
      revokeSessionsOnPasswordReset: true,
      // Runs before the sessions are deleted, so it must not throw.
      onPasswordReset: async ({ user }) => {
        log("info", "password_reset_completed", { userId: user.id });
      },
      requireEmailVerification: authEmailPolicy.emailVerificationRequired,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      // bcrypt uses only the first 72 bytes; hooks.before enforces the byte limit.
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      password: {
        hash: async (password) => bcrypt.hash(password, 10),
        verify: async ({ hash, password }) => bcrypt.compare(password, hash),
      },
    },
    emailVerification: {
      sendOnSignUp: authEmailPolicy.emailVerificationRequired,
      sendVerificationEmail: async ({ user, url }, callbackRequest) => {
        // Unauthenticated /send-verification-email accepts any registered
        // address, verified or not. Change-email (not enabled) would pass the
        // user with emailVerified false, so this skip would not affect it.
        if (user.emailVerified) return;
        try {
          await deliverAuthEmail(env, "email-verification", user.id, () =>
            sendEmailVerificationEmail(env, { to: user.email, url })
          );
        } catch (error) {
          // Sign-up has already created the account when this runs, so failing
          // it would report "Registration failed" for an account that exists.
          // Let sign-up succeed: the app sends the person to sign in, where they
          // can resend the email. Resends and configuration errors still fail.
          if (error instanceof AuthEmailDeliveryError && isSignUpRequest(callbackRequest)) {
            log("warn", "auth_email_send_failed", {
              userId: user.id,
              tag: error.tag,
              provider: error.provider,
              status: error.status,
            });
            return;
          }
          throw error;
        }
      },
    },
    plugins,
    hooks: {
      before: rejectInvalidNewPassword,
    },
    databaseHooks: {
      user: {
        // Better Auth accepts any value for name and image; check them on every
        // user write so an account cannot store a huge name or a foreign avatar URL.
        create: {
          before: async (user) => {
            if (blockTestAccounts) assertNotBlockedTestEmail(user.email);
            return { data: validateUserProfileWrite(user, "create", userProfilePolicy) };
          },
        },
        update: {
          // Better Auth replaces the update with the returned data, so always return it.
          before: async (user, context) => {
            const data = validateUserProfileWrite(user, "update", userProfilePolicy);
            await assertUsernameAvailableForUpdate(data, context);
            return { data };
          },
        },
      },
      // Every sign-in, whatever the endpoint (email, username) or body format,
      // creates a session, so production blocks test-domain accounts here.
      session: {
        create: {
          before: async (session) => {
            if (!blockTestAccounts) return;
            const owner = await db
              .select({ email: schema.users.email })
              .from(schema.users)
              .where(eq(schema.users.id, session.userId))
              .get();
            assertNotBlockedTestEmail(owner?.email);
          },
        },
      },
    },
    user: {
      modelName: "users",
      fields: {
        image: "avatar_url",
        emailVerified: "email_verified",
        createdAt: "auth_created_at",
        updatedAt: "auth_updated_at",
        displayUsername: "displayUsername",
      },
    },
    account: {
      modelName: "account",
      fields: {
        userId: "userId",
        accountId: "accountId",
        providerId: "providerId",
      },
    },
    session: {
      modelName: "session",
      fields: {
        userId: "userId",
      },
    },
    verification: {
      modelName: "verification",
    },
    advanced: {
      useSecureCookies: isSecure,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: isSecure,
        sameSite: "lax",
      },
    },
  });
};
