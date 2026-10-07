import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_TOO_LONG_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
  passwordExceedsMaxBytes,
} from "@/lib/schemas/passwordLimits";

export type PasswordPolicyResult = { ok: true } | { ok: false; message: string };

export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  if (password.trim().length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: PASSWORD_TOO_SHORT_MESSAGE };
  }
  if (passwordExceedsMaxBytes(password)) {
    return { ok: false, message: PASSWORD_TOO_LONG_MESSAGE };
  }
  return { ok: true };
}
