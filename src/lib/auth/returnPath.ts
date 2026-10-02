import { VERIFY_EMAIL_LOGIN_PATH } from "@/lib/auth/loginPrefill";
import { canonicalPath } from "@/lib/http/urlStandard";
import {
  buildConsoleHomePath,
  buildForgotPasswordPath,
  buildLoginPath,
  buildRegisterPath,
  buildResetPasswordPath,
} from "@/lib/routes";

export const RETURN_PATH_PARAM = "next";

const PLACEHOLDER_ORIGIN = "https://return-path.invalid";
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

const meansTheSameWhenReadAgain = (path: string): boolean =>
  toSameOriginPath(path, PLACEHOLDER_ORIGIN) === path;

export function sanitizeReturnPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }
  if (value.includes("\\") || hasControlCharacter(value)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN || hasControlCharacter(decodeURIComponentSafe(url.pathname))) {
    return null;
  }

  if (AUTH_PAGES.has(canonicalPath(url.pathname.toLowerCase()))) {
    return null;
  }

  const result = `${canonicalPath(url.pathname)}${url.search}${url.hash}`;
  return meansTheSameWhenReadAgain(result) ? result : null;
}

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

export function getReturnPath(search: string | URLSearchParams): string | null {
  return sanitizeReturnPath(new URLSearchParams(search).get(RETURN_PATH_PARAM));
}

export function withReturnPath(path: string, returnPath: string | null): string {
  if (!returnPath) {
    return path;
  }

  const url = new URL(path, PLACEHOLDER_ORIGIN);
  url.searchParams.set(RETURN_PATH_PARAM, returnPath);
  return `${url.pathname}${url.search}`;
}

export function getPostSignInDestination(returnPath: string | null): string {
  return returnPath ?? buildConsoleHomePath();
}

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

  return getPostSignInDestination(returnPath);
}
