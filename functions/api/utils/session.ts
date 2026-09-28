import type { Env } from "../types";
import { createBetterAuth } from "../better-auth";
import { log } from "./logger";

/**
 * The signed-in user's id, or null when the request has no valid session.
 *
 * Better Auth's getSession resolves null for every signed-out case (no or
 * unsigned cookie, missing or expired session) and throws only when the lookup
 * itself fails, such as a D1 outage. That failure is rethrown so the router
 * answers 500: returning null would turn it into a 401 that sends a signed-in
 * user to the sign-in page and hides the outage in the logs.
 */
export async function getSessionUserId(request: Request, env: Env): Promise<string | null> {
  try {
    const auth = createBetterAuth(env, request);
    const session = await auth.api.getSession({
      headers: request.headers,
      // Read-only lookup. Refreshing here would extend the session in D1 while
      // the new Set-Cookie is dropped, so the browser cookie would expire first.
      // Only GET /api/auth/get-session (auth.handler) extends sessions, because
      // its cookie reaches the browser; the app calls it on load and on focus.
      query: { disableRefresh: true },
    });

    return session?.user?.id ?? null;
  } catch (error) {
    // The name and status only: a wrapped query error can carry the session token.
    const status = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
    log("error", "session_lookup_failed", {
      requestId: request.headers.get("X-Request-Id") ?? undefined,
      errorName: error instanceof Error ? error.name : typeof error,
      status: typeof status === "string" || typeof status === "number" ? status : undefined,
    });
    throw error;
  }
}
