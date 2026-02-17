import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { haveIBeenPwned, username } from "better-auth/plugins";
import bcrypt from "bcryptjs";
import type { Env } from "./types";
import { createDb, schema } from "./db";
import { resolveAuthSecret } from "./utils/auth-secret";

const sendPasswordResetEmail = async (env: Env, params: { to: string; url: string }) => {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    console.warn("Password reset email skipped: missing RESEND_API_KEY or EMAIL_FROM");
    return;
  }

  const payload = {
    from: env.EMAIL_FROM,
    to: params.to,
    subject: "Reset your password",
    text: `Reset your password: ${params.url}`,
  };

  try {
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
      console.warn("Password reset email send failed", {
        status: response.status,
        body,
      });
    }
  } catch (error) {
    console.warn("Failed to send password reset email", { error });
  }
};

export function createBetterAuth(env: Env, request: Request) {
  const authSecret = resolveAuthSecret(env);

  const origin = new URL(request.url).origin;

  const trustedOrigins = new Set<string>();
  trustedOrigins.add(origin);
  if (env.FRONTEND_URL) {
    try {
      trustedOrigins.add(new URL(env.FRONTEND_URL).origin);
    } catch {
      console.warn("Ignoring invalid FRONTEND_URL for trustedOrigins", { value: env.FRONTEND_URL });
    }
  }
  trustedOrigins.add("http://localhost:8080");
  trustedOrigins.add("http://localhost:8788");

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
        void sendPasswordResetEmail(env, { to: user.email, url });
      },
      onPasswordReset: async ({ user }, request) => {
        console.info(`Password reset completed for ${user.email}`);
      },
      requireEmailVerification: false,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      password: {
        hash: async (password) => bcrypt.hash(password, 10),
        verify: async ({ hash, password }) => bcrypt.compare(password, hash),
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
}
