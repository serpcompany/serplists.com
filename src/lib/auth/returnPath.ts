import { createPath } from "react-router-dom";

import { buildConsoleHomePath } from "@/lib/routes";

/**
 * Where to send someone after they sign in or sign up. Protected pages and the
 * invite page pass it as router state (`state.from`); the `next` query
 * parameter carries it through places history state cannot reach, such as the
 * email verification link or a new tab.
 */

export const RETURN_PATH_PARAM = "next";

// Any origin works: it only lets URL() resolve a relative path so a value that
// escapes to another origin can be detected.
const PARSE_BASE = "https://return-path.invalid";
const AUTH_PAGES = new Set(["/login", "/register", "/forgot-password", "/reset-password"]);
const hasControlCharacter = (value: string): boolean =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });

/**
 * Returns an in-app path (pathname + search + hash) or null. Rejects anything
 * that could leave the app (`//host`, `/\host`, schemes), control characters,
 * and the auth pages themselves so sign-in cannot loop.
 */
export function sanitizeReturnPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }
  if (value.includes("\\") || hasControlCharacter(value)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value, PARSE_BASE);
  } catch {
    return null;
  }
  if (url.origin !== PARSE_BASE || hasControlCharacter(decodeURIComponentSafe(url.pathname))) {
    return null;
  }

  const normalizedPathname = url.pathname.replace(/\/+$/, "").toLowerCase() || "/";
  if (AUTH_PAGES.has(normalizedPathname)) {
    return null;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function returnPathFromState(state: unknown): string | null {
  if (!state || typeof state !== "object") {
    return null;
  }

  const from = (state as { from?: unknown }).from;
  if (typeof from === "string") {
    return sanitizeReturnPath(from);
  }
  if (!from || typeof from !== "object") {
    return null;
  }

  const { pathname, search, hash } = from as { pathname?: unknown; search?: unknown; hash?: unknown };
  if (typeof pathname !== "string") {
    return null;
  }

  // createPath adds a missing "?" or "#" separator, so a Stripe return such as
  // ?billing=success survives sign-in whichever form the location was saved in.
  return sanitizeReturnPath(
    createPath({
      pathname,
      search: typeof search === "string" ? search : "",
      hash: typeof hash === "string" ? hash : "",
    }),
  );
}

/** Router state first, then the `next` query parameter. */
export function getReturnPath(location: { state?: unknown; search?: string }): string | null {
  return (
    returnPathFromState(location.state) ??
    sanitizeReturnPath(new URLSearchParams(location.search ?? "").get(RETURN_PATH_PARAM))
  );
}

/** Adds the return path to an auth page link as `next`, encoded once. */
export function withReturnPath(path: string, returnPath: string | null): string {
  if (!returnPath) {
    return path;
  }

  const url = new URL(path, PARSE_BASE);
  url.searchParams.set(RETURN_PATH_PARAM, returnPath);
  return `${url.pathname}${url.search}`;
}

export function buildAuthLinkState(returnPath: string | null): { from: string } | undefined {
  return returnPath ? { from: returnPath } : undefined;
}

export function getPostRegisterDestination({
  email,
  requiresEmailVerification,
  returnPath,
}: {
  email: string;
  requiresEmailVerification: boolean;
  returnPath: string | null;
}): { to: string; state: { from: string } | undefined } {
  if (requiresEmailVerification) {
    return {
      to: withReturnPath(`/login?verify_email=1&email=${encodeURIComponent(email)}`, returnPath),
      state: buildAuthLinkState(returnPath),
    };
  }

  return { to: returnPath ?? buildConsoleHomePath(), state: undefined };
}
