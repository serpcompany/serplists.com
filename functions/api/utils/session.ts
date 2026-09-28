import type { Env } from "../types";
import { createBetterAuth } from "../better-auth";

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
  } catch {
    return null;
  }
}

