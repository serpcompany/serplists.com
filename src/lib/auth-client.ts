import { env } from "@/env";
import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";
import { AuthStatusError, parseRetryAfterSeconds } from "@/lib/auth/authErrors";

import { resolveApiBaseUrl, resolveApiServerOrigin } from "@/lib/apiBaseUrl";

const API_BASE_URL = resolveApiBaseUrl({
  isDev: import.meta.env.DEV,
  configuredUrl: env.VITE_API_URL,
  pageHostname: typeof window === "undefined" ? undefined : window.location.hostname,
});

export const authClient = createAuthClient({
  baseURL: resolveApiServerOrigin(API_BASE_URL, () => window.location.origin),
  plugins: [usernameClient()],
  fetchOptions: {
    credentials: "include",
  },
});

export async function getAuthStatus(): Promise<{
  accountRegistrationAvailable?: boolean;
  emailAuthAvailable: boolean;
  emailVerificationRequired?: boolean;
}> {
  const response = await fetch(`${API_BASE_URL}/auth/status`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new AuthStatusError(response.status, parseRetryAfterSeconds(response.headers.get("Retry-After")));
  }

  return (await response.json()) as { emailAuthAvailable: boolean };
}

export type Session = typeof authClient.$Infer.Session;
