import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { haveIBeenPwned, username } from "better-auth/plugins";
import bcrypt from "bcryptjs";
import type { Env } from "./types";
import { createDb, schema } from "./db";
import { resolveAuthSecret } from "./utils/auth-secret";
import { resolveConfiguredCorsOrigins } from "./utils/cors";
import { log } from "./utils/logger";

const sendEmail = async (
  env: Env,
  params: { to: string; subject: string; text: string; tag: "password-reset" | "email-verification" }
) => {
  const from = env.EMAIL_FROM?.trim() || "noreply@mail.auth.serp.co";

  const payload = {
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
  };

  if (env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Resend auth email send failed (${response.status}) for ${params.tag}: ${body || "unknown error"}`
      );
    }
    return;
  }

  if (env.USESEND_API_KEY) {
    const response = await fetch("https://app.usesend.com/api/v1/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.USESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `UseSend auth email send failed (${response.status}) for ${params.tag}: ${body || "unknown error"}`
      );
    }
    return;
  }

  throw new Error("Auth email provider is not configured. Set RESEND_API_KEY or USESEND_API_KEY.");
};

const sendPasswordResetEmail = async (env: Env, params: { to: string; url: string }) => {
  await sendEmail(env, {
    to: params.to,
    subject: "Reset your password",
    text: `Reset your password: ${params.url}`,
    tag: "password-reset",
  });
};

const sendEmailVerificationEmail = async (env: Env, params: { to: string; url: string }) => {
  await sendEmail(env, {
    to: params.to,
    subject: "Verify your email",
    text: `Verify your email: ${params.url}`,
    tag: "email-verification",
  });
};

function isAuthEmailConfigured(env: Env): boolean {
  return Boolean(env.RESEND_API_KEY || env.USESEND_API_KEY);
}

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
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordResetEmail(env, { to: user.email, url });
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
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmailVerificationEmail(env, { to: user.email, url });
      },
    },
    plugins,
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
