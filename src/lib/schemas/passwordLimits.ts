export const MIN_PASSWORD_LENGTH = 10;

export const MAX_PASSWORD_BYTES = 72;

export const PASSWORD_TOO_SHORT_MESSAGE = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
export const PASSWORD_TOO_LONG_MESSAGE =
  `Password must be at most ${MAX_PASSWORD_BYTES} characters, ` +
  "or fewer if it has emoji or accented letters";

function passwordByteLength(password: string): number {
  return new TextEncoder().encode(password).length;
}

export function passwordExceedsMaxBytes(password: string): boolean {
  return passwordByteLength(password) > MAX_PASSWORD_BYTES;
}
