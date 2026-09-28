import { createPath } from "react-router-dom";
import { z } from "zod";

import { buildConsoleSettingsPath } from "@/lib/routes";

// RequireAuth, access-flow and the invite page send the page to return to as
// router state: { from: { pathname, search, hash } }. History state can hold
// anything, so parse it instead of trusting its shape.
const loginStateSchema = z.object({
  from: z.object({
    pathname: z.string().min(1),
    search: z.string().optional(),
    hash: z.string().optional(),
  }),
});

const PROBE_ORIGIN = "https://return-path.invalid";

// Only a path on this origin: it starts with one "/" (not "//", which is
// protocol-relative) and still resolves to this origin once the URL parser has
// treated "\" as "/" and stripped tabs and newlines.
const isSameOriginRelativePath = (path: string): boolean => {
  if (!path.startsWith("/") || path.startsWith("//")) {
    return false;
  }

  try {
    return new URL(path, PROBE_ORIGIN).origin === PROBE_ORIGIN;
  } catch {
    return false;
  }
};

// Where to go after sign-in. Keeps the saved query and hash, so a buyer who
// returns from Stripe signed out still reaches settings with ?billing=success.
export const getLoginReturnPath = (state: unknown): string => {
  const parsed = loginStateSchema.safeParse(state);
  if (!parsed.success) {
    return buildConsoleSettingsPath();
  }

  const { pathname, search = "", hash = "" } = parsed.data.from;
  if (!isSameOriginRelativePath(pathname)) {
    return buildConsoleSettingsPath();
  }

  const path = createPath({ pathname, search, hash });
  return isSameOriginRelativePath(path) ? path : buildConsoleSettingsPath();
};
