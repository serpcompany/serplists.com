import { env } from "@/env";
import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";
import { AuthStatusError, parseRetryAfterSeconds } from "@/lib/auth/authErrors";
import { authStatusSchema, type AuthStatus } from "@/lib/schemas/authStatus";

import { resolveApiBaseUrl, resolveApiServerOrigin } from "@/lib/apiBaseUrl";

const API_BASE_URL = resolveApiBaseUrl({
  configuredUrl: env.NEXT_PUBLIC_API_URL,
  pageHostname: typeof window === "undefined" ? undefined : window.location.hostname,
});

const PLACEHOLDER_ORIGIN_FOR_SERVER_RENDER = "http://localhost";

const pageOrigin = (): string =>
  typeof window === "undefined" ? PLACEHOLDER_ORIGIN_FOR_SERVER_RENDER : window.location.origin;

export const authClient = createAuthClient({
  baseURL: resolveApiServerOrigin(API_BASE_URL, pageOrigin),
  plugins: [usernameClient()],
  fetchOptions: {
    credentials: "include",
  },
});

export async function getAuthStatus(): Promise<AuthStatus> {
  const response = await fetch(`${API_BASE_URL}/auth/status`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new AuthStatusError(response.status, parseRetryAfterSeconds(response.headers.get("Retry-After")));
  }

  const body: unknown = await response.json();
  return authStatusSchema.parse(body);
}

export type Session = typeof authClient.$Infer.Session;
