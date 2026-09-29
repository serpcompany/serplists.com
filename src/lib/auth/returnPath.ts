import { VERIFY_EMAIL_LOGIN_PATH } from "@/lib/auth/loginPrefill";
import { canonicalPath } from "@/lib/http/urlStandard";
import {
  buildConsoleHomePath,
  buildForgotPasswordPath,
  buildLoginPath,
  buildRegisterPath,
  buildResetPasswordPath,
} from "@/lib/routes";

/**
 * Where to send someone after they sign in or sign up. Protected pages, the invite
 * page and the auth pages' own links carry it in the `next` query parameter, which
 * also survives the email verification link and a new tab. The login page reads it
 * with getReturnPath, which sanitizes it, and follows only a path on its own origin.
 */

export const RETURN_PATH_PARAM = "next";

// Any origin works: it only lets URL() resolve a relative path so a value that
// escapes to another origin can be detected.
const PARSE_BASE = "https://return-path.invalid";
const AUTH_PAGES = new Set([
  buildLoginPath(),
  buildRegisterPath(),
  buildForgotPasswordPath(),
  buildResetPasswordPath(),
]);
const hasControlCharacter = (value: string): boolean =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });

/**
 * Returns an in-app path (pathname + search + hash) or null. Rejects anything
 * that could leave the app (`//host`, `/\host`, schemes), control characters,
 * and the auth pages themselves so sign-in cannot loop. The path comes back in its
 * canonical form (src/lib/http/urlStandard.ts), so a return path from an older link
 * (`/dashboard/templates`) opens its page without a redirect.
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

  if (AUTH_PAGES.has(canonicalPath(url.pathname.toLowerCase()))) {
    return null;
  }

  // The parser removes dot segments, so /.//evil.com comes back as //evil.com, which
  // a browser resolves to another origin. Only return a path that means the same
  // thing when it is read again.
  const result = `${canonicalPath(url.pathname)}${url.search}${url.hash}`;
  return toSameOriginPath(result, PARSE_BASE) === result ? result : null;
}

/**
 * Resolves an in-app path against `origin` and returns its path, query, and hash,
 * or null when it, or the path it normalizes to, would leave that origin. A
 * navigation then never follows the raw value.
 */
export function toSameOriginPath(path: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(path, origin);
  } catch {
    return null;
  }
  const result = `${url.pathname}${url.search}${url.hash}`;
  if (path.startsWith("//") || result.startsWith("//") || url.origin !== new URL(origin).origin) {
    return null;
  }
  return result;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** The sanitized `next` parameter of a query, or null. */
export function getReturnPath(search: string | URLSearchParams): string | null {
  return sanitizeReturnPath(new URLSearchParams(search).get(RETURN_PATH_PARAM));
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

/**
 * Where sign-up sends a new account. An account that must verify its email goes to the
 * login page, which asks for that first; sign-up hands the address over in
 * sessionStorage, never in the URL (src/lib/auth/loginPrefill.ts).
 */
export function getPostRegisterDestination({
  requiresEmailVerification,
  returnPath,
}: {
  requiresEmailVerification: boolean;
  returnPath: string | null;
}): string {
  if (requiresEmailVerification) {
    return withReturnPath(VERIFY_EMAIL_LOGIN_PATH, returnPath);
  }

  return returnPath ?? buildConsoleHomePath();
}
