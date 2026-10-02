const MIN_SECRET_LENGTH = 32;

function normalizeSecret(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type AuthSecretSettings = { BETTER_AUTH_SECRET?: string | undefined; JWT_SECRET?: string | undefined };

export function resolveAuthSecret(env: AuthSecretSettings): string {
  const betterAuthSecret = normalizeSecret(env.BETTER_AUTH_SECRET);
  if (betterAuthSecret && betterAuthSecret.length >= MIN_SECRET_LENGTH) {
    return betterAuthSecret;
  }

  const legacyJwtSecret = normalizeSecret(env.JWT_SECRET);
  if (legacyJwtSecret && legacyJwtSecret.length >= MIN_SECRET_LENGTH) {
    return legacyJwtSecret;
  }

  throw new Error("A 32+ char BETTER_AUTH_SECRET (or legacy JWT_SECRET) is required for auth sessions");
}
