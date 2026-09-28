import { APIError, createAuthMiddleware } from "better-auth/api";
import {
  PASSWORD_TOO_LONG_MESSAGE,
  passwordExceedsMaxBytes,
} from "../../../src/lib/schemas/passwordLimits";

/**
 * Better Auth endpoints that hash a new password, and the body field that holds
 * it. bcrypt ignores everything after 72 bytes, so a longer new password would
 * be stored as its first 72 bytes and any string sharing them would sign in.
 *
 * Sign-in is deliberately absent. It hashes the submitted password when the
 * email is unknown (to keep timing even), so rejecting long passwords there
 * would reveal which emails have accounts, and existing passwords longer than
 * 72 bytes must keep working.
 */
export const NEW_PASSWORD_BODY_FIELDS: Readonly<Record<string, string>> = {
  "/sign-up/email": "password",
  "/change-password": "newPassword",
  "/reset-password": "newPassword",
  "/set-password": "newPassword",
};

/** The overlong-password error for a request, or null when it may continue. */
export function findOverlongNewPassword(path: string, body: unknown): APIError | null {
  const field = Object.hasOwn(NEW_PASSWORD_BODY_FIELDS, path) ? NEW_PASSWORD_BODY_FIELDS[path] : undefined;
  if (!field || typeof body !== "object" || body === null) return null;
  const password = (body as Record<string, unknown>)[field];
  if (typeof password !== "string" || !passwordExceedsMaxBytes(password)) return null;
  return new APIError("BAD_REQUEST", { message: PASSWORD_TOO_LONG_MESSAGE, code: "PASSWORD_TOO_LONG" });
}

/**
 * Runs before every Better Auth endpoint, so the check happens before any
 * write: sign-up creates no user, and a rejected reset leaves its token usable.
 */
export const rejectOverlongNewPassword = createAuthMiddleware(async (ctx) => {
  const error = findOverlongNewPassword(ctx.path, ctx.body);
  if (error) throw error;
});
