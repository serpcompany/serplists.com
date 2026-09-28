import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { haveIBeenPwned, username } from "better-auth/plugins";
import bcrypt from "bcryptjs";
import type { Env } from "./types";
import { createDb, schema } from "./db";
import { resolveAuthSecret } from "./utils/auth-secret";
import { resolveConfiguredCorsOrigins } from "./utils/cors";
import {
  AuthEmailDeliveryError,
  isAuthEmailConfigured,
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
} from "./utils/auth-email";
import { deliverAuthEmail, discardUnsentPasswordResetToken } from "./utils/auth-email-throttle";
import { log } from "./utils/logger";
import { buildUserProfileWritePolicy, validateUserProfileWrite } from "./utils/user-profile-validation";

function isProductionHost(hostname: string): boolean {
  return hostname === "serplists.com" || hostname.endsWith(".serplists.com");
}

function isProductionAuthRequest(env: Env, request: Request): boolean {
  const url = new URL(request.url);
  if (isProductionHost(url.hostname)) {
    return true;
  }

  if (env.FRONTEND_URL) {
    try {
      return isProductionHost(new URL(env.FRONTEND_URL).hostname);
    } catch {
      return false;
    }
  }

  return false;
}

export function getAuthEmailPolicy(env: Env, request: Request) {
  const emailAuthAvailable = isAuthEmailConfigured(env);
  const configuredRequirement = env.AUTH_EMAIL_VERIFICATION_REQUIRED;
  const emailVerificationRequired = configuredRequirement
    ? configuredRequirement === "true"
    : emailAuthAvailable || isProductionAuthRequest(env, request);

  return {
    accountRegistrationAvailable: emailAuthAvailable || !emailVerificationRequired,
    emailAuthAvailable,
    emailVerificationRequired,
  };
}

function isSignUpRequest(request: Request | undefined): boolean {
  return request !== undefined && new URL(request.url).pathname.endsWith("/auth/sign-up/email");
}

function shouldCheckBreachedPassword(env: Env, request: Request): boolean {
  if (!isProductionAuthRequest(env, request)) {
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
  const authEmailPolicy = getAuthEmailPolicy(env, request);

  const origin = new URL(request.url).origin;

  const trustedOrigins = new Set<string>();
  trustedOrigins.add(origin);
  for (const configuredOrigin of resolveConfiguredCorsOrigins(env)) {
    trustedOrigins.add(configuredOrigin);
  }

  const isSecure = origin.startsWith("https://");
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
    secret: authSecret,
    trustedOrigins: Array.from(trustedOrigins),
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
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
      minPasswordLength: 10,
      maxPasswordLength: 128,
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
    // Better Auth accepts any value for name and image; check them on every
    // user write so an account cannot store a huge name or a foreign avatar URL.
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({ data: validateUserProfileWrite(user, "create", userProfilePolicy) }),
        },
        update: {
          // Better Auth replaces the update with the returned data, so always return it.
          before: async (user) => ({ data: validateUserProfileWrite(user, "update", userProfilePolicy) }),
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
