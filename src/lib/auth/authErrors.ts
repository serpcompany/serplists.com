import { z } from 'zod';

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

export class AuthStatusError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | undefined;

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
  if (error instanceof Error || typeof error !== 'object' || error === null) return null;
  const parsed = authErrorBodySchema.safeParse(error);
  return parsed.success ? parsed.data : null;
}

function rateLimitMessage(retryAfterSeconds?: number): string {
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

export function parseRetryAfterSeconds(header: string | null): number | undefined {
  if (header === null || !/^\s*\d+\s*$/.test(header)) return undefined;
  const seconds = Number(header);
  return seconds > 0 ? seconds : undefined;
}
