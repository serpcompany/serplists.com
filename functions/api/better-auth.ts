import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { haveIBeenPwned, username } from "better-auth/plugins";
import bcrypt from "bcryptjs";
import type { Env } from "./types";
import { createDb, schema } from "./db";
import { resolveAuthSecret } from "./utils/auth-secret";
import { resolveConfiguredCorsOrigins } from "./utils/cors";

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

export function createBetterAuth(env: Env, request: Request) {
  const authSecret = resolveAuthSecret(env);

  const origin = new URL(request.url).origin;

  const trustedOrigins = new Set<string>();
  trustedOrigins.add(origin);
  for (const configuredOrigin of resolveConfiguredCorsOrigins(env)) {
    trustedOrigins.add(configuredOrigin);
  }

  const isSecure = origin.startsWith("https://");

  const db = createDb(env);

  return betterAuth({
    secret: authSecret,
    trustedOrigins: Array.from(trustedOrigins),
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, url }, request) => {
        await sendPasswordResetEmail(env, { to: user.email, url });
      },
      onPasswordReset: async ({ user }, request) => {
        console.info(`Password reset completed for ${user.email}`);
      },
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      password: {
        hash: async (password) => bcrypt.hash(password, 10),
        verify: async ({ hash, password }) => bcrypt.compare(password, hash),
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }, request) => {
        await sendEmailVerificationEmail(env, { to: user.email, url });
      },
    },
    plugins: [
      username(),
      haveIBeenPwned({
        customPasswordCompromisedMessage:
          "Password is too common/compromised. Choose a stronger password.",
      }),
    ],
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
