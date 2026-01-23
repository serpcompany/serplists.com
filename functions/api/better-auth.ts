import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { haveIBeenPwned, username } from "better-auth/plugins";
import bcrypt from "bcryptjs";
import type { Env } from "./types";
import { createDb, schema } from "./db";

export function createBetterAuth(env: Env, request: Request) {
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET is required for cookie sessions");
  }

  const origin = new URL(request.url).origin;

  const trustedOrigins = new Set<string>();
  trustedOrigins.add(origin);
  if (env.FRONTEND_URL) trustedOrigins.add(new URL(env.FRONTEND_URL).origin);
  trustedOrigins.add("http://localhost:8080");
  trustedOrigins.add("http://localhost:8788");

  const isSecure = origin.startsWith("https://");

  const db = createDb(env);

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: Array.from(trustedOrigins),
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
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
        displayUsername: "display_username",
      },
    },
    account: {
      modelName: "account",
      fields: {
        userId: "user_id",
        accountId: "account_id",
        providerId: "provider_id",
      },
    },
    session: {
      modelName: "session",
      fields: {
        userId: "user_id",
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
