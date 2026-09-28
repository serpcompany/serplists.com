import { z } from 'zod';

/**
 * Error text for Better Auth client calls (sign-in, sign-up, password reset,
 * verification emails, profile and password changes).
 *
 * The client resolves a failed call as `{ error: { ...body, status, statusText } }`.
 * Better Auth's own errors put the text in `message`; the API router answers some
 * auth requests itself (rate limit, blocked test account, email unavailable) and
 * older deployments send only `error`. Both are read here, and a 429 always
 * becomes a wait message so a user is never told their password was wrong.
 */

const optionalText = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1))
  .optional()
  .catch(undefined);

const authErrorBodySchema = z.object({
  message: optionalText,
  error: optionalText,
  code: z.string().optional().catch(undefined),
  status: z.number().optional().catch(undefined),
  retryAfterSeconds: z.number().positive().finite().optional().catch(undefined),
});

type AuthErrorBody = z.infer<typeof authErrorBodySchema>;

/** Thrown by getAuthStatus when /api/auth/status answers with an error. */
export class AuthStatusError extends Error {
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(status: number, retryAfterSeconds?: number) {
    super(`Failed to load auth status: ${status}`);
    this.name = 'AuthStatusError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function readAuthError(error: unknown): AuthErrorBody | null {
  if (error instanceof AuthStatusError) {
    return { status: error.status, retryAfterSeconds: error.retryAfterSeconds };
  }
  // Anything else thrown (a network TypeError, a bug) has a technical message
  // that is not for users.
  if (error instanceof Error || typeof error !== 'object' || error === null) return null;
  const parsed = authErrorBodySchema.safeParse(error);
  return parsed.success ? parsed.data : null;
}

export function rateLimitMessage(retryAfterSeconds?: number): string {
  if (retryAfterSeconds === undefined) {
    return 'Too many attempts. Please wait a few minutes and try again.';
  }
  const seconds = Math.ceil(retryAfterSeconds);
  if (seconds < 60) {
    return `Too many attempts. Please try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `Too many attempts. Please try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
}

/**
 * The message to show for a failed auth call: a wait message for a 429, then
 * the body's `message`, then its `error`, then `fallback`.
 */
export function getAuthErrorMessage(error: unknown, fallback: string): string {
  const body = readAuthError(error);
  if (!body) return fallback;
  if (body.status === 429) return rateLimitMessage(body.retryAfterSeconds);
  if (error instanceof AuthStatusError) return fallback;
  return body.message ?? body.error ?? fallback;
}

export function isEmailNotVerifiedError(error: unknown): boolean {
  const body = readAuthError(error);
  if (!body) return false;
  if (body.code === 'EMAIL_NOT_VERIFIED') return true;
  return (body.message ?? body.error ?? '').toLowerCase().includes('email not verified');
}

/** Retry-After in seconds; the HTTP-date form is not used by this API. */
export function parseRetryAfterSeconds(header: string | null): number | undefined {
  if (header === null || !/^\s*\d+\s*$/.test(header)) return undefined;
  const seconds = Number(header);
  return seconds > 0 ? seconds : undefined;
}
