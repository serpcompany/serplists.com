import { APIError, createAuthMiddleware } from "better-auth/api";
import { z } from "zod";
import {
  PASSWORD_TOO_LONG_MESSAGE,
  passwordExceedsMaxBytes,
} from "../../../src/lib/schemas/passwordLimits";

export const NEW_PASSWORD_BODY_FIELDS: Readonly<Record<string, string>> = {
  "/sign-up/email": "password",
  "/change-password": "newPassword",
  "/reset-password": "newPassword",
  "/set-password": "newPassword",
};

const newPasswordFieldFor = (path: string): string | undefined =>
  Object.hasOwn(NEW_PASSWORD_BODY_FIELDS, path) ? NEW_PASSWORD_BODY_FIELDS[path] : undefined;

const requestBodySchema = z.record(z.unknown());

const bodyField = (body: unknown, field: string): unknown => requestBodySchema.safeParse(body).data?.[field];

export function findMissingNewPassword(path: string, body: unknown): APIError | null {
  const field = newPasswordFieldFor(path);
  if (!field) return null;
  const password = bodyField(body, field);
  if (typeof password === "string") return null;
  return new APIError("BAD_REQUEST", { message: "Invalid password", code: "INVALID_PASSWORD" });
}

export function findOverlongNewPassword(path: string, body: unknown): APIError | null {
  const field = newPasswordFieldFor(path);
  if (!field) return null;
  const password = bodyField(body, field);
  if (typeof password !== "string" || !passwordExceedsMaxBytes(password)) return null;
  return new APIError("BAD_REQUEST", { message: PASSWORD_TOO_LONG_MESSAGE, code: "PASSWORD_TOO_LONG" });
}

export const rejectInvalidNewPassword = createAuthMiddleware(async (ctx) => {
  const error = findMissingNewPassword(ctx.path, ctx.body) ?? findOverlongNewPassword(ctx.path, ctx.body);
  if (error) throw error;
});
