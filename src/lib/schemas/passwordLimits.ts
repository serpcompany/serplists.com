// Password limits shared by the API (Better Auth config) and the forms that set
// a password (Register, ResetPassword, Account security), so they cannot drift.

export const MIN_PASSWORD_LENGTH = 10;

// Passwords are hashed with bcrypt, which uses only the first 72 UTF-8 bytes:
// anything after that would be silently ignored at sign-in. ASCII characters
// are 1 byte each, accented letters 2, most other scripts 3, and emoji 4.
export const MAX_PASSWORD_BYTES = 72;
export const MAX_PASSWORD_LENGTH = MAX_PASSWORD_BYTES;

export const PASSWORD_TOO_SHORT_MESSAGE = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
export const PASSWORD_TOO_LONG_MESSAGE =
  `Password must be at most ${MAX_PASSWORD_BYTES} characters, ` +
  "or fewer if it has emoji or accented letters";

/** UTF-8 byte length, counted the way bcrypt counts it (a lone surrogate is 3 bytes). */
export function passwordByteLength(password: string): number {
  return new TextEncoder().encode(password).length;
}

/**
 * True when bcrypt would ignore part of the password. Checks the raw value,
 * untrimmed, because that is what the server hashes.
 */
export function passwordExceedsMaxBytes(password: string): boolean {
  return passwordByteLength(password) > MAX_PASSWORD_BYTES;
}
