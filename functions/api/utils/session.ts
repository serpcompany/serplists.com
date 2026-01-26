import type { Env } from "../types";
import { createBetterAuth } from "../better-auth";

export async function getSessionUserId(request: Request, env: Env): Promise<string | null> {
  try {
    const auth = createBetterAuth(env, request);
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

