import type { Env } from "../types";
import { createBetterAuth } from "../better-auth";
import { log } from "./logger";

function describeSessionLookupFailure(error: unknown): { errorName: string; status?: string | number } {
  const status = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
  return {
    errorName: error instanceof Error ? error.name : typeof error,
    status: typeof status === "string" || typeof status === "number" ? status : undefined,
  };
}

export async function getSessionUserId(request: Request, env: Env): Promise<string | null> {
  try {
    const auth = createBetterAuth(env, request);
    const session = await auth.api.getSession({
      headers: request.headers,
      query: { disableRefresh: true },
    });

    return session?.user?.id ?? null;
  } catch (error) {
    log("error", "session_lookup_failed", {
      requestId: request.headers.get("X-Request-Id") ?? undefined,
      ...describeSessionLookupFailure(error),
    });
    throw error;
  }
}
