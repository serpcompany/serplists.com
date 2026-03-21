import { env } from "@/env";
import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

const DEV_API_BASE_URL = env.VITE_API_URL ?? "http://localhost:8788/api";
const API_BASE_URL = import.meta.env.DEV ? DEV_API_BASE_URL : env.VITE_API_URL ?? "/api";

const resolveServerOrigin = (): string => {
  if (API_BASE_URL.startsWith("http://") || API_BASE_URL.startsWith("https://")) {
    return new URL(API_BASE_URL).origin;
  }
  return window.location.origin;
};

export const authClient = createAuthClient({
  baseURL: resolveServerOrigin(),
  plugins: [usernameClient()],
  fetchOptions: {
    credentials: "include",
  },
});

export async function getAuthStatus(): Promise<{ emailAuthAvailable: boolean }> {
  const response = await fetch(`${API_BASE_URL}/auth/status`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Failed to load auth status: ${response.status}`);
  }

  return (await response.json()) as { emailAuthAvailable: boolean };
}

export type Session = typeof authClient.$Infer.Session;
